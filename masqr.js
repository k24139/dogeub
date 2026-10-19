import fs from "node:fs"
import path from "node:path"
import process from "node:process"
import { Buffer } from "node:buffer"
import { createHmac, timingSafeEqual } from "node:crypto"

export const LICENSE_SERVER_URL = process.env.MASQR_LICENSE_SERVER_URL || "http://localhost:8004/validate"
export const whiteListedDomains = []
export const failure = fs.readFileSync("Checkfailed.html", "utf8")
export const placeholder = fs.readFileSync("placeholder.svg", "utf8")

export async function MasqFail(req, reply) {
  if (!req.headers.host) return

  const host = req.headers.host.split(":")[0]
  const root = path.resolve(process.cwd(), "Masqrd")
  const safeJoin = path.resolve(root, `${host}.html`)

  if (!/^[a-z0-9.-]+$/i.test(host) || !safeJoin.startsWith(`${root}${path.sep}`)) {
    reply.header("Content-Type", "text/html").send(failure)
    return
  }

  try {
    await fs.promises.access(safeJoin)
    const bruh = await fs.promises.readFile(safeJoin, "utf8")
    reply.header("Content-Type", "text/html").send(bruh)
  } catch {
    reply.header("Content-Type", "text/html").send(failure)
  }
}

export async function MasqrMiddleware(req, reply) {
  const host = req.headers.host?.split(":")[0]
  if (host && whiteListedDomains.includes(host)) return

  if (req.url.includes("placeholder.svg")) {
    reply.header("Content-Type", "image/svg+xml").send(placeholder)
    return
  }

  const authHeader = req.headers.authorization

  const secret = process.env.MASQR_COOKIE_SECRET
  if (!secret) {
    reply.code(503).send("Masqr is enabled but MASQR_COOKIE_SECRET is not configured.")
    return
  }

  const token = req.cookies?.auth
  if (token && isValidAuthCookie(token, secret)) return

  if (req.cookies?.refreshcheck !== "true") {
    reply.setCookie("refreshcheck", "true", { maxAge: 10, path: "/" })
    await MasqFail(req, reply)
    return
  }

  if (!authHeader) {
    reply.header("WWW-Authenticate", "Basic").status(401)
    await MasqFail(req, reply)
    return
  }

  if (!authHeader.startsWith("Basic ")) {
    reply.header("WWW-Authenticate", "Basic").code(401)
    await MasqFail(req, reply)
    return
  }
  const decoded = Buffer.from(authHeader.slice(6), "base64").toString("utf8")
  const pass = decoded.slice(decoded.indexOf(":") + 1)
  if (!pass) {
    reply.header("WWW-Authenticate", "Basic").code(401)
    await MasqFail(req, reply)
    return
  }

  try {
    const licenseUrl = new URL(LICENSE_SERVER_URL)
    licenseUrl.searchParams.set("license", pass)
    licenseUrl.searchParams.set("host", host || "")
    const licenseRes = await fetch(licenseUrl, { signal: AbortSignal.timeout(5000) })
    const licenseData = await licenseRes.json()

    if (licenseData.status === "License valid") {
      const expiry = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30
      reply.setCookie("auth", createAuthCookie(expiry, secret), {
        expires: new Date(expiry * 1000),
        path: "/",
        httpOnly: true,
        sameSite: "Strict",
        secure: req.protocol === "https" || req.headers["x-forwarded-proto"] === "https",
      })
      reply.redirect(303, req.url)
      return
    }
  } catch {
    // Treat license service failures as an unavailable authorization.
  }

  await MasqFail(req, reply)
}

function createAuthCookie(expiry, secret) {
  const value = String(expiry)
  const signature = createHmac("sha256", secret).update(value).digest("base64url")
  return `${value}.${signature}`
}

function isValidAuthCookie(token, secret) {
  const [expiry, signature, extra] = token.split(".")
  if (!expiry || !signature || extra || !/^\d+$/.test(expiry) || Number(expiry) < Date.now() / 1000) return false
  const expected = createHmac("sha256", secret).update(expiry).digest()
  let supplied
  try {
    supplied = Buffer.from(signature, "base64url")
  } catch {
    return false
  }
  return supplied.length === expected.length && timingSafeEqual(supplied, expected)
}
