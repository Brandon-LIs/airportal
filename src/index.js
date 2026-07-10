import { renderHTML } from './html.js'

let seeded = false

async function sendSMTP(to, subject, html, env) {
  try {
    const colaKey = env.COLA_KEY || ''
    const smtpEmail = env.SMTP_EMAIL || ''
    const smtpCode = env.SMTP_CODE || ''
    const res = await fetch('https://luckycola.com.cn/tools/customMail', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ColaKey: colaKey,
        tomail: to,
        fromTitle: '空投快传',
        subject: subject,
        content: html,
        smtpCode: smtpCode,
        smtpEmail: smtpEmail,
        smtpCodeType: '163'
      })
    })
    const data = await res.json()
    if (data.code !== 0 && data.code !== undefined) {
      console.error('Email API error:', JSON.stringify(data))
      return false
    }
    return true
  } catch (e) {
    console.error('Email error:', e.message)
    return false
  }
}

// ─── Utilities ────────────────────────────────────────────────────

function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000))
}

function generateKey() {
  const c = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let r = ''
  for (let i = 0; i < 10; i++) r += c.charAt(Math.floor(Math.random() * c.length))
  return r
}

function generateToken() {
  const c = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let r = ''
  for (let i = 0; i < 48; i++) r += c.charAt(Math.floor(Math.random() * c.length))
  return r
}

async function hashPassword(password, salt) {
  const enc = new TextEncoder()
  const km = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: enc.encode(salt), iterations: 100000, hash: 'SHA-256' }, km, 256
  )
  return Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, '0')).join('')
}

function generateSalt() {
  const a = new Uint8Array(16)
  crypto.getRandomValues(a)
  return Array.from(a).map(b => b.toString(16).padStart(2, '0')).join('')
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400'
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json;charset=utf-8', ...CORS }
  })
}

function error(msg, status = 400) {
  return json({ error: msg }, status)
}

// ─── Seed Admin ───────────────────────────────────────────────────

async function seedAdmin(env) {
  if (seeded) return
  seeded = true
  const adminEmail = env.ADMIN_EMAIL || 'admin@example.com'
  const adminPw = env.ADMIN_PASSWORD || 'changeme123'
  try {
    const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(adminEmail).first()
    if (!existing) {
      const salt = generateSalt()
      const hash = await hashPassword(adminPw, salt)
      await env.DB.prepare(
        'INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)'
      ).bind(adminEmail, salt + ':' + hash, 'admin').run()
    }
  } catch (e) { console.error('Seed admin failed:', e.message) }
}

// ─── Auth Helpers ─────────────────────────────────────────────────

async function authenticate(request, env) {
  const auth = request.headers.get('Authorization')
  if (!auth || !auth.startsWith('Bearer ')) return null
  const token = auth.slice(7)
  const s = await env.DB.prepare(
    `SELECT s.user_id, u.id, u.email, u.role, u.created_at
     FROM sessions s JOIN users u ON s.user_id = u.id WHERE s.token = ?`
  ).bind(token).first()
  return s ? { id: s.id, email: s.email, role: s.role, created_at: s.created_at } : null
}

async function getUserIdFromAuth(request, env) {
  const auth = request.headers.get('Authorization')
  if (!auth || !auth.startsWith('Bearer ')) return null
  const s = await env.DB.prepare(
    'SELECT user_id FROM sessions WHERE token = ?'
  ).bind(auth.slice(7)).first()
  return s ? s.user_id : null
}

// ─── Main Worker ─────────────────────────────────────────────────

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const path = url.pathname
    const method = request.method

    if (method === 'OPTIONS') return new Response(null, { headers: CORS })
    await seedAdmin(env)

    // Auth
    if (path === '/api/auth/register' && method === 'POST') return handleRegister(request, env)
    if (path === '/api/auth/login' && method === 'POST') return handleLogin(request, env)
    if (path === '/api/auth/profile' && method === 'GET') return handleProfile(request, env)
    if (path === '/api/auth/send-code' && method === 'POST') return handleSendCode(request, env)
    if (path === '/api/auth/change-password' && method === 'POST') return handleChangePassword(request, env)

    // Files
    if (path === '/api/airportal/send' && method === 'POST') return handleSend(request, env)
    if (path === '/api/airportal/sendtext' && method === 'POST') return handleSendText(request, env)
    if (path === '/api/airportal/receive' && method === 'POST') return handleReceive(request, env)
    if (path.startsWith('/api/airportal/get/') && method === 'GET') {
      return handleGetFile(request, env, path.slice('/api/airportal/get/'.length))
    }
    if (path.startsWith('/api/airportal/download/') && method === 'GET') {
      return handleDownload(request, env, path.slice('/api/airportal/download/'.length))
    }

    // User history
    if (path === '/api/user/history' && method === 'GET') return handleUserHistory(request, env)

    // User settings
    if (path === '/api/user/bind-email' && method === 'POST') return handleBindEmail(request, env)
    if (path === '/api/user/bind-social-start' && method === 'GET') return handleBindSocialStart(request, env)

    // Social bind callback (different from login callback)
    if (path === '/api/auth/social-bind-callback' && method === 'GET') return handleSocialBindCallback(request, env)

    // Admin
    if (path === '/api/admin/files' && method === 'GET') return handleAdminFiles(request, env)
    if (path.startsWith('/api/admin/files/') && method === 'DELETE') {
      return handleAdminDeleteFile(request, env, parseInt(path.slice('/api/admin/files/'.length)))
    }
    if (path.startsWith('/api/admin/download/') && method === 'GET') {
      return handleAdminDownload(request, env, path.slice('/api/admin/download/'.length))
    }
    if (path.startsWith('/api/admin/preview/') && method === 'GET') {
      return handleAdminPreview(request, env, path.slice('/api/admin/preview/'.length))
    }
    if (path === '/api/admin/users' && method === 'GET') return handleAdminUsers(request, env)
    if (path.startsWith('/api/admin/users/') && method === 'DELETE') {
      return handleAdminDeleteUser(request, env, parseInt(path.slice('/api/admin/users/'.length)))
    }

    // Clear all R2 files (admin only)
    if (path === '/api/admin/clear-r2' && method === 'POST') {
      const admin = await authenticate(request, env)
      if (!admin || admin.role !== 'admin') return error('无权限', 403)
      let cursor, deleted = 0
      do {
        const list = await env.R2.list({ cursor, limit: 1000 })
        for (const obj of list.objects) { await env.R2.delete(obj.key).catch(() => {}); deleted++ }
        cursor = list.cursor
      } while (cursor)
      return json({ message: '已删除 ' + deleted + ' 个文件' })
    }

    // Social login
    if (path === '/api/auth/social-login' && method === 'GET') return handleSocialLogin(request, env)
    if (path === '/api/auth/social-callback' && method === 'GET') return handleSocialCallback(request, env)

    // Frontend
    const html = renderHTML({ turnstileKey: env.TURNSTILE_KEY || '' })
    if (path === '/' || /^\/\d{6}\/[A-Za-z0-9]{10}$/.test(path)) {
      return new Response(html, { headers: { 'Content-Type': 'text/html;charset=utf-8' } })
    }
    return new Response(html, { headers: { 'Content-Type': 'text/html;charset=utf-8' } })
  },

  // ─── Cron: cleanup expired files ──────────────────────────────
  async scheduled(event, env) {
    try {
      const expired = await env.DB.prepare(
        `SELECT id, r2_path FROM files WHERE expires_at IS NOT NULL AND expires_at <= datetime('now')`
      ).all()
      for (const f of (expired.results || [])) {
        await env.R2.delete(f.r2_path).catch(() => {})
        await env.DB.prepare('DELETE FROM files WHERE id = ?').bind(f.id).run()
      }
      // Clean old verification codes
      await env.DB.prepare(
        "DELETE FROM verification_codes WHERE expires_at <= datetime('now')"
      ).run()
      console.log('Cleanup done, removed', (expired.results || []).length, 'expired files')
    } catch (e) {
      console.error('Cleanup error:', e.message)
    }
  }
}

// ─── Auth Handlers ───────────────────────────────────────────────

async function handleSendCode(request, env) {
  try {
    const { email } = await request.json()
    if (!email) return error('请填写邮箱')

    const code = generateCode()
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()

    await env.DB.prepare(
      'INSERT INTO verification_codes (email, code, expires_at) VALUES (?, ?, ?)'
    ).bind(email, code, expiresAt).run()

    const html = '<div style="padding:20px;font-family:sans-serif"><h2>空投快传 - 邮箱验证</h2><p>您的验证码是：</p><p style="font-size:32px;letter-spacing:8px;font-weight:bold;text-align:center;padding:20px;background:#f5f5f5;border-radius:8px">' + code + '</p><p>验证码有效期 10 分钟，请勿泄露给他人。</p></div>'

    const sent = await sendSMTP(email, '空投快传 - 邮箱验证码', html, env)
    if (!sent) return error('验证码发送失败，请检查邮箱是否正确', 500)
    // Log success
    console.log('Verification code sent to', email)

    return json({ message: '验证码已发送' })
  } catch (e) {
    return error('发送失败', 500)
  }
}

async function verifyCode(env, email, code) {
  const row = await env.DB.prepare(
    `SELECT id FROM verification_codes
     WHERE email = ? AND code = ? AND used = 0 AND expires_at > datetime('now')
     ORDER BY created_at DESC LIMIT 1`
  ).bind(email, code).first()
  if (!row) return false
  await env.DB.prepare('UPDATE verification_codes SET used = 1 WHERE id = ?').bind(row.id).run()
  return true
}

async function handleRegister(request, env) {
  try {
    const { email, password, code } = await request.json()
    if (!email || !password || !code) return error('请填写邮箱、密码和验证码')
    if (password.length < 6) return error('密码至少6位')
    if (await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first()) {
      return error('邮箱已注册')
    }
    if (!await verifyCode(env, email, code)) return error('验证码无效或已过期')

    const salt = generateSalt()
    const hash = await hashPassword(password, salt)
    const result = await env.DB.prepare(
      'INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)'
    ).bind(email, salt + ':' + hash, 'user').run()
    const token = generateToken()
    await env.DB.prepare('INSERT INTO sessions (user_id, token) VALUES (?, ?)').bind(result.meta.last_row_id, token).run()
    return json({ token, user: { id: result.meta.last_row_id, email, role: 'user' } })
  } catch (e) {
    return error('注册失败', 500)
  }
}

async function handleLogin(request, env) {
  try {
    const { email, password } = await request.json()
    if (!email || !password) return error('请填写邮箱和密码')
    const user = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first()
    if (!user) return error('邮箱或密码错误', 401)
    const [salt, stored] = user.password_hash.split(':')
    if (await hashPassword(password, salt) !== stored) return error('邮箱或密码错误', 401)
    const token = generateToken()
    await env.DB.prepare('INSERT INTO sessions (user_id, token) VALUES (?, ?)').bind(user.id, token).run()
    return json({ token, user: { id: user.id, email: user.email, role: user.role, created_at: user.created_at } })
  } catch (e) {
    return error('登录失败', 500)
  }
}

async function handleProfile(request, env) {
  const user = await authenticate(request, env)
  if (!user) return error('未登录', 401)
  // Get nickname from DB
  const full = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(user.id).first()
  return json({ user: { ...user, nickname: full?.nickname || '' } })
}

async function handleChangePassword(request, env) {
  try {
    const { email, code, newPassword } = await request.json()
    if (!email || !code || !newPassword) return error('请填写邮箱、验证码和新密码')
    if (newPassword.length < 6) return error('密码至少6位')
    if (!await verifyCode(env, email, code)) return error('验证码无效或已过期')

    const user = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first()
    if (!user) return error('用户不存在', 404)

    const salt = generateSalt()
    const hash = await hashPassword(newPassword, salt)
    await env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(salt + ':' + hash, user.id).run()

    return json({ message: '密码修改成功' })
  } catch (e) {
    return error('修改失败', 500)
  }
}

// ─── Social Login ─────────────────────────────────────────────────
function getSocialConfig(env) {
  return { appid: env.SOCIAL_APPID || '', key: env.SOCIAL_KEY || '' }
}

async function handleSocialLogin(request, env) {
  const type = new URL(request.url).searchParams.get('type') || 'qq'
  const cfg = getSocialConfig(env)
  const base = new URL(request.url).origin
  const redirect = encodeURIComponent(base + '/api/auth/social-callback')
  const url = 'https://u.daib.cn/connect.php?act=login&appid=' + cfg.appid + '&appkey=' + cfg.key + '&type=' + type + '&redirect_uri=' + redirect
  try {
    const res = await fetch(url)
    const data = await res.json()
    if (data.code !== 0) return error(data.msg || '获取登录地址失败')
    return json({ url: data.url, qrcode: data.qrcode, type })
  } catch (e) {
    return error('获取登录地址失败', 500)
  }
}

async function handleSocialCallback(request, env) {
  const params = new URL(request.url).searchParams
  const type = params.get('type')
  const code = params.get('code')
  const cfg = getSocialConfig(env)
  if (!type || !code) {
    return Response.redirect(new URL(request.url).origin + '/#login_error', 302)
  }
  const base = new URL(request.url).origin
  const redirect = encodeURIComponent(base + '/api/auth/social-callback')
  const url = 'https://u.daib.cn/connect.php?act=callback&appid=' + cfg.appid + '&appkey=' + cfg.key + '&type=' + type + '&code=' + code + '&redirect_uri=' + redirect
  try {
    const res = await fetch(url)
    const data = await res.json()
    if (data.code !== 0 || !data.social_uid) {
      return Response.redirect(base + '/#login_error', 302)
    }

    const socialId = 'social_' + type + '_' + data.social_uid
    const nickname = (data.nickname || '用户').substring(0, 50)

    // Check for existing user by social_type+social_uid first, then by email
    let user = await env.DB.prepare('SELECT * FROM users WHERE social_type = ? AND social_uid = ?').bind(type, data.social_uid).first()
    if (!user) {
      user = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(socialId).first()
    }

    if (!user) {
      const salt = generateSalt()
      const hash = await hashPassword(generateToken(), salt)
      const result = await env.DB.prepare(
        'INSERT INTO users (email, password_hash, role, nickname, social_type, social_uid) VALUES (?, ?, ?, ?, ?, ?)'
      ).bind(socialId, salt + ':' + hash, 'user', nickname, type, data.social_uid).run()
      user = { id: result.meta.last_row_id, email: socialId, role: 'user', nickname }
    } else {
      // Update nickname and social info
      await env.DB.prepare(
        'UPDATE users SET nickname = ?, social_type = ?, social_uid = ? WHERE id = ?'
      ).bind(nickname, type, data.social_uid, user.id).run()
    }

    const token = generateToken()
    await env.DB.prepare('INSERT INTO sessions (user_id, token) VALUES (?, ?)').bind(user.id, token).run()

    const displayEmail = nickname + ' (' + user.email + ')'
    return Response.redirect(base + '/#login_success?token=' + token + '&email=' + encodeURIComponent(user.email) + '&nickname=' + encodeURIComponent(nickname) + '&role=' + user.role, 302)
  } catch (e) {
    return Response.redirect(new URL(request.url).origin + '/#login_error', 302)
  }
}

// ─── Bind Email / Social ───────────────────────────────────────────

async function handleBindEmail(request, env) {
  const user = await authenticate(request, env)
  if (!user) return error('未登录', 401)
  try {
    const { email, code, password } = await request.json()
    if (!email || !code || !password) return error('请填写完整')
    if (password.length < 6) return error('密码至少6位')
    if (!await verifyCode(env, email, code)) return error('验证码无效或已过期')
    // Check email not taken
    const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ? AND id != ?').bind(email, user.id).first()
    if (existing) return error('该邮箱已被绑定')

    const salt = generateSalt()
    const hash = await hashPassword(password, salt)
    await env.DB.prepare(
      'UPDATE users SET email = ?, password_hash = ?, nickname = ? WHERE id = ?'
    ).bind(email, salt + ':' + hash, user.nickname || email.split('@')[0], user.id).run()

    return json({ message: '绑定成功', email })
  } catch (e) {
    return error('绑定失败', 500)
  }
}

async function handleBindSocialStart(request, env) {
  const user = await authenticate(request, env)
  if (!user) return error('未登录', 401)
  const type = new URL(request.url).searchParams.get('type') || 'qq'
  const cfg = getSocialConfig(env)

  const bindCode = generateCode() + '-' + generateCode()
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()

  await env.DB.prepare(
    'INSERT INTO verification_codes (email, code, expires_at) VALUES (?, ?, ?)'
  ).bind('bind:' + user.id, bindCode, expiresAt).run()

  const base = new URL(request.url).origin
  const redirect = encodeURIComponent(base + '/api/auth/social-bind-callback?bind_code=' + bindCode)
  const loginUrl = 'https://u.daib.cn/connect.php?act=login&appid=' + cfg.appid + '&appkey=' + cfg.key + '&type=' + type + '&redirect_uri=' + redirect

  try {
    const res = await fetch(loginUrl)
    const data = await res.json()
    if (data.code !== 0) return error(data.msg || '获取失败')
    return json({ url: data.url })
  } catch (e) {
    return error('获取失败', 500)
  }
}

async function handleSocialBindCallback(request, env) {
  const params = new URL(request.url).searchParams
  const bindCode = params.get('bind_code')
  const type = params.get('type')
  const code = params.get('code')
  const cfg = getSocialConfig(env)
  const base = new URL(request.url).origin

  if (!bindCode || !type || !code) return Response.redirect(base + '/#login_error', 302)

  try {
    const row = await env.DB.prepare(
      `SELECT * FROM verification_codes WHERE email LIKE 'bind:%' AND code = ? AND used = 0 AND expires_at > datetime('now')`
    ).bind(bindCode).first()
    if (!row) return Response.redirect(base + '/#login_error', 302)

    const userId = row.email.replace('bind:', '')
    await env.DB.prepare('UPDATE verification_codes SET used = 1 WHERE id = ?').bind(row.id).run()

    const redirect = encodeURIComponent(base + '/api/auth/social-bind-callback?bind_code=' + bindCode)
    const apiUrl = 'https://u.daib.cn/connect.php?act=callback&appid=' + cfg.appid + '&appkey=' + cfg.key + '&type=' + type + '&code=' + code + '&redirect_uri=' + redirect
    const res = await fetch(apiUrl)
    const data = await res.json()
    if (data.code !== 0 || !data.social_uid) return Response.redirect(base + '/#login_error', 302)

    // Check if social account already bound
    const existing = await env.DB.prepare(
      'SELECT id FROM users WHERE social_type = ? AND social_uid = ? AND id != ?'
    ).bind(type, data.social_uid, userId).first()
    if (existing) return Response.redirect(base + '/#login_error', 302)

    await env.DB.prepare(
      'UPDATE users SET social_type = ?, social_uid = ?, nickname = ? WHERE id = ?'
    ).bind(type, data.social_uid, (data.nickname || '').substring(0, 50), parseInt(userId)).run()

    return Response.redirect(base + '/#bind_success', 302)
  } catch (e) {
    return Response.redirect(base + '/#login_error', 302)
  }
}

// ─── User History ────────────────────────────────────────────────

async function handleUserHistory(request, env) {
  const user = await authenticate(request, env)
  if (!user) return error('未登录', 401)
  try {
    const files = await env.DB.prepare(
      `SELECT id, code, key, filename, filesize, content_type, expires_at, created_at,
              downloads, is_text, text_content
       FROM files WHERE user_id = ?
       ORDER BY created_at DESC LIMIT 100`
    ).bind(user.id).all()
    return json({ files: files.results || [] })
  } catch (e) {
    return error('获取失败', 500)
  }
}

// ─── File Handlers ───────────────────────────────────────────────

async function handleSend(request, env) {
  try {
    const formData = await request.formData()
    const file = formData.get('file')
    const expiresInHours = parseInt(formData.get('expiresInHours') || '24')
    if (!file) return error('请选择文件')

    const code = generateCode()
    const key = generateKey()
    const r2Path = code + '/' + key
    const expiresAt = new Date(Date.now() + expiresInHours * 3600 * 1000).toISOString()

    await env.R2.put(r2Path, file.stream(), {
      httpMetadata: { contentType: file.type || 'application/octet-stream' }
    })

    let userId = await getUserIdFromAuth(request, env)
    if (!userId) {
      const token = formData.get('token')
      if (token) {
        const s = await env.DB.prepare('SELECT user_id FROM sessions WHERE token = ?').bind(token).first()
        if (s) userId = s.user_id
      }
    }

    await env.DB.prepare(
      `INSERT INTO files (code, key, filename, filesize, content_type, r2_path, expires_at, sender_ip, user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(code, key, file.name, file.size, file.type || 'application/octet-stream',
      r2Path, expiresAt, request.headers.get('CF-Connecting-IP') || 'unknown', userId
    ).run()

    return json({ code, key, filename: file.name, filesize: file.size, expires_at: expiresAt })
  } catch (e) {
    return error('上传失败', 500)
  }
}

async function handleSendText(request, env) {
  try {
    const body = await request.json()
    const { text, expiresInHours = 24 } = body
    if (!text || !text.trim()) return error('请输入文本内容')
    const code = generateCode()
    const key = generateKey()
    const r2Path = code + '/' + key
    const expiresAt = new Date(Date.now() + expiresInHours * 3600 * 1000).toISOString()
    const filename = '文本_' + code + '.txt'
    const textBytes = new TextEncoder().encode(text)

    await env.R2.put(r2Path, textBytes, { httpMetadata: { contentType: 'text/plain;charset=utf-8' } })

    let userId = await getUserIdFromAuth(request, env)
    if (!userId && body.token) {
      const s = await env.DB.prepare('SELECT user_id FROM sessions WHERE token = ?').bind(body.token).first()
      if (s) userId = s.user_id
    }

    await env.DB.prepare(
      `INSERT INTO files (code, key, filename, filesize, content_type, r2_path, expires_at, is_text, text_content, sender_ip, user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`
    ).bind(code, key, filename, textBytes.length, 'text/plain;charset=utf-8',
      r2Path, expiresAt, text, request.headers.get('CF-Connecting-IP') || 'unknown', userId
    ).run()

    return json({ code, key, filename, text })
  } catch (e) {
    return error('发送失败', 500)
  }
}

async function handleReceive(request, env) {
  try {
    const { code } = await request.json()
    if (!code || code.length !== 6) return error('请输入6位取件码')
    const files = await env.DB.prepare(
      `SELECT id, code, key, filename, filesize, content_type, expires_at, created_at,
              downloads, is_text, text_content
       FROM files WHERE code = ? AND (expires_at IS NULL OR expires_at > datetime('now'))
       ORDER BY created_at DESC`
    ).bind(code).all()
    if (!files.results || files.results.length === 0) return error('取件码无效或已过期', 404)
    return json({ files: files.results })
  } catch (e) {
    return error('取件失败', 500)
  }
}

async function handleGetFile(request, env, key) {
  try {
    const file = await env.DB.prepare(
      `SELECT id, code, key, filename, filesize, content_type, expires_at, created_at,
              downloads, is_text, text_content, user_id
       FROM files WHERE key = ? AND (expires_at IS NULL OR expires_at > datetime('now'))`
    ).bind(key).first()
    if (!file) return error('文件不存在或已过期', 404)
    return json({ file })
  } catch (e) {
    return error('获取失败', 500)
  }
}

async function handleDownload(request, env, key) {
  try {
    const file = await env.DB.prepare(
      `SELECT * FROM files WHERE key = ? AND (expires_at IS NULL OR expires_at > datetime('now'))`
    ).bind(key).first()
    if (!file) return error('文件不存在或已过期', 404)

    await env.DB.prepare('UPDATE files SET downloads = downloads + 1 WHERE id = ?').bind(file.id).run()

    const object = await env.R2.get(file.r2_path)
    if (!object) return error('文件存储不存在', 404)

    const isImage = file.content_type && file.content_type.startsWith('image/')
    const headers = new Headers()
    headers.set('Content-Type', file.content_type || 'application/octet-stream')
    headers.set('Content-Disposition', isImage ? 'inline' : 'attachment; filename="' + encodeURIComponent(file.filename) + '"')
    headers.set('Content-Length', object.size)
    headers.set('Cache-Control', 'public, max-age=3600')

    return new Response(object.body, { headers })
  } catch (e) {
    return error('下载失败', 500)
  }
}

// ─── Admin Handlers ──────────────────────────────────────────────

async function handleAdminFiles(request, env) {
  const user = await authenticate(request, env)
  if (!user || user.role !== 'admin') return error('无权限', 403)
  const files = await env.DB.prepare(
    `SELECT f.*, u.email as user_email
     FROM files f LEFT JOIN users u ON f.user_id = u.id
     ORDER BY f.created_at DESC LIMIT 200`
  ).all()
  return json({ files: files.results || [] })
}

async function handleAdminDeleteFile(request, env, id) {
  const user = await authenticate(request, env)
  if (!user || user.role !== 'admin') return error('无权限', 403)
  const file = await env.DB.prepare('SELECT * FROM files WHERE id = ?').bind(id).first()
  if (!file) return error('文件不存在', 404)
  await env.R2.delete(file.r2_path)
  await env.DB.prepare('DELETE FROM files WHERE id = ?').bind(id).run()
  return json({ success: true })
}

async function handleAdminDownload(request, env, key) {
  const user = await authenticate(request, env)
  if (!user || user.role !== 'admin') return error('无权限', 403)
  return streamFileByKey(env, key, true)
}

async function handleAdminPreview(request, env, key) {
  const user = await authenticate(request, env)
  if (!user || user.role !== 'admin') return error('无权限', 403)
  return streamFileByKey(env, key, false)
}

async function streamFileByKey(env, key, asAttachment) {
  try {
    const file = await env.DB.prepare('SELECT * FROM files WHERE key = ?').bind(key).first()
    if (!file) return error('文件不存在', 404)
    const object = await env.R2.get(file.r2_path)
    if (!object) return error('文件存储不存在', 404)
    const headers = new Headers()
    headers.set('Content-Type', file.content_type || 'application/octet-stream')
    headers.set('Content-Disposition', asAttachment
      ? 'attachment; filename="' + encodeURIComponent(file.filename) + '"'
      : 'inline')
    headers.set('Content-Length', object.size)
    return new Response(object.body, { headers })
  } catch (e) {
    return error('操作失败', 500)
  }
}

async function handleAdminUsers(request, env) {
  const user = await authenticate(request, env)
  if (!user || user.role !== 'admin') return error('无权限', 403)
  const users = await env.DB.prepare(
    'SELECT id, email, role, created_at FROM users ORDER BY created_at DESC'
  ).all()
  return json({ users: users.results || [] })
}

async function handleAdminDeleteUser(request, env, id) {
  const user = await authenticate(request, env)
  if (!user || user.role !== 'admin') return error('无权限', 403)
  if (id === user.id) return error('不能删除自己', 400)
  const target = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first()
  if (!target) return error('用户不存在', 404)
  if (target.role === 'admin') return error('不能删除管理员', 400)
  await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id).run()
  await env.DB.prepare('DELETE FROM files WHERE user_id = ?').bind(id).run()
  await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id).run()
  return json({ success: true })
}
