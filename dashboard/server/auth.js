import path from 'node:path'
import fs from 'node:fs'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import session from 'express-session'
import passport from 'passport'
import { Strategy as LocalStrategy } from 'passport-local'
import { Strategy as GoogleStrategy } from 'passport-google-oauth20'
import bcrypt from 'bcryptjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const usersPath = path.join(__dirname, 'cache', 'users.json')
const SALT_ROUNDS = 12

function parseList(value) {
  return String(value || '')
    .split(/[,;\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
}

function allowedEmails() {
  return new Set(parseList(process.env.AUTH_ALLOWED_EMAILS || process.env.ALLOWED_EMAILS))
}

function readUsersFile() {
  try {
    if (!fs.existsSync(usersPath)) return { users: [] }
    const raw = JSON.parse(fs.readFileSync(usersPath, 'utf8'))
    return { users: Array.isArray(raw?.users) ? raw.users : [] }
  } catch {
    return { users: [] }
  }
}

function writeUsersFile(data) {
  fs.mkdirSync(path.dirname(usersPath), { recursive: true })
  fs.writeFileSync(usersPath, JSON.stringify(data, null, 2))
}

function findUserByUsername(username) {
  const needle = String(username || '').trim().toLowerCase()
  return readUsersFile().users.find((u) => u.username?.toLowerCase() === needle) || null
}

function findUserById(id) {
  return readUsersFile().users.find((u) => u.id === id) || null
}

/** Seed / update password users from AUTH_USERS=user:pass,user2:pass2 */
export function seedUsersFromEnv() {
  const raw = process.env.AUTH_USERS?.trim()
  if (!raw) return { seeded: 0 }

  const data = readUsersFile()
  let seeded = 0
  for (const part of raw.split(',')) {
    const trimmed = part.trim()
    if (!trimmed) continue
    const colon = trimmed.indexOf(':')
    if (colon <= 0) {
      console.warn(`[auth] Skipping invalid AUTH_USERS entry (expected user:pass): ${trimmed}`)
      continue
    }
    const username = trimmed.slice(0, colon).trim()
    const password = trimmed.slice(colon + 1)
    if (!username || !password) continue

    const existing = data.users.find((u) => u.username.toLowerCase() === username.toLowerCase())
    const passwordHash = bcrypt.hashSync(password, SALT_ROUNDS)
    if (existing) {
      existing.passwordHash = passwordHash
      existing.updatedAt = new Date().toISOString()
    } else {
      data.users.push({
        id: crypto.randomUUID(),
        username,
        passwordHash,
        displayName: username,
        createdAt: new Date().toISOString(),
      })
    }
    seeded += 1
  }
  if (seeded) writeUsersFile(data)
  return { seeded }
}

function publicUser(user) {
  if (!user) return null
  return {
    id: user.id,
    username: user.username || null,
    email: user.email || null,
    displayName: user.displayName || user.username || user.email || 'User',
    provider: user.provider || 'local',
  }
}

export function googleConfigured() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim(),
  )
}

export function authConfigured() {
  const hasLocal = readUsersFile().users.length > 0 || Boolean(process.env.AUTH_USERS?.trim())
  return hasLocal || googleConfigured()
}

export function createSessionMiddleware() {
  const isProd = process.env.NODE_ENV === 'production' || process.env.RENDER === 'true'
  const secret = process.env.SESSION_SECRET?.trim()
  if (!secret) {
    console.warn(
      '[auth] SESSION_SECRET is missing — using an insecure default. Set SESSION_SECRET in production.',
    )
  }

  return session({
    name: 'atul.sid',
    secret: secret || 'dev-insecure-session-secret-change-me',
    resave: false,
    saveUninitialized: false,
    proxy: isProd,
    cookie: {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
    },
  })
}

export function configurePassport() {
  passport.serializeUser((user, done) => {
    done(null, {
      id: user.id,
      provider: user.provider || 'local',
      username: user.username || null,
      email: user.email || null,
      displayName: user.displayName || null,
    })
  })

  passport.deserializeUser((stored, done) => {
    try {
      if (stored?.provider === 'google') {
        done(null, {
          id: stored.id,
          provider: 'google',
          email: stored.email,
          displayName: stored.displayName || stored.email,
        })
        return
      }
      const user = findUserById(stored?.id)
      if (!user) {
        done(null, false)
        return
      }
      done(null, {
        id: user.id,
        provider: 'local',
        username: user.username,
        displayName: user.displayName || user.username,
      })
    } catch (e) {
      done(e)
    }
  })

  passport.use(
    new LocalStrategy({ usernameField: 'username', passwordField: 'password' }, (username, password, done) => {
      try {
        const user = findUserByUsername(username)
        if (!user?.passwordHash) {
          done(null, false, { message: 'Invalid username or password.' })
          return
        }
        if (!bcrypt.compareSync(password, user.passwordHash)) {
          done(null, false, { message: 'Invalid username or password.' })
          return
        }
        done(null, {
          id: user.id,
          provider: 'local',
          username: user.username,
          displayName: user.displayName || user.username,
        })
      } catch (e) {
        done(e)
      }
    }),
  )

  if (googleConfigured()) {
    const callbackURL =
      process.env.GOOGLE_CALLBACK_URL?.trim() ||
      '/api/auth/google/callback'

    passport.use(
      new GoogleStrategy(
        {
          clientID: process.env.GOOGLE_CLIENT_ID.trim(),
          clientSecret: process.env.GOOGLE_CLIENT_SECRET.trim(),
          callbackURL,
        },
        (_accessToken, _refreshToken, profile, done) => {
          try {
            const email = (profile.emails?.[0]?.value || '').trim().toLowerCase()
            if (!email) {
              done(null, false, { message: 'Google account has no email.' })
              return
            }
            const allow = allowedEmails()
            if (allow.size === 0) {
              done(null, false, {
                message:
                  'AUTH_ALLOWED_EMAILS is empty. Add your Google email to the server env to allow sign-in.',
              })
              return
            }
            if (!allow.has(email)) {
              done(null, false, { message: 'This Google account is not authorized.' })
              return
            }
            done(null, {
              id: `google:${profile.id}`,
              provider: 'google',
              email,
              displayName: profile.displayName || email,
            })
          } catch (e) {
            done(e)
          }
        },
      ),
    )
  }
}

export function requireAuth(req, res, next) {
  if (req.isAuthenticated?.() && req.user) {
    next()
    return
  }
  res.status(401).json({ error: 'Authentication required.' })
}

export function mountAuthRoutes(app) {
  app.get('/api/auth/status', (req, res) => {
    res.json({
      configured: authConfigured(),
      googleEnabled: googleConfigured(),
      authenticated: Boolean(req.isAuthenticated?.() && req.user),
      user: publicUser(req.user),
    })
  })

  app.get('/api/auth/me', (req, res) => {
    if (!req.isAuthenticated?.() || !req.user) {
      res.status(401).json({ error: 'Not authenticated.' })
      return
    }
    res.json({ user: publicUser(req.user) })
  })

  app.post('/api/auth/login', (req, res, next) => {
    if (!authConfigured()) {
      res.status(503).json({
        error:
          'Auth is not configured. Set AUTH_USERS and/or Google OAuth env vars on the server.',
      })
      return
    }
    passport.authenticate('local', (err, user, info) => {
      if (err) {
        next(err)
        return
      }
      if (!user) {
        res.status(401).json({ error: info?.message || 'Invalid username or password.' })
        return
      }
      req.logIn(user, (loginErr) => {
        if (loginErr) {
          next(loginErr)
          return
        }
        res.json({ ok: true, user: publicUser(user) })
      })
    })(req, res, next)
  })

  app.post('/api/auth/logout', (req, res, next) => {
    req.logout((err) => {
      if (err) {
        next(err)
        return
      }
      req.session.destroy(() => {
        res.clearCookie('atul.sid')
        res.json({ ok: true })
      })
    })
  })

  if (googleConfigured()) {
    app.get(
      '/api/auth/google',
      passport.authenticate('google', {
        scope: ['profile', 'email'],
        prompt: 'select_account',
      }),
    )

    app.get('/api/auth/google/callback', (req, res, next) => {
      passport.authenticate('google', (err, user, info) => {
        if (err) {
          next(err)
          return
        }
        if (!user) {
          const msg = encodeURIComponent(info?.message || 'Google sign-in failed.')
          res.redirect(`/login?error=${msg}`)
          return
        }
        req.logIn(user, (loginErr) => {
          if (loginErr) {
            next(loginErr)
            return
          }
          res.redirect('/')
        })
      })(req, res, next)
    })
  }
}
