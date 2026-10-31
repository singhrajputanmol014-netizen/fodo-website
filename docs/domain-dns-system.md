# Custom domains, DNS and SSL (v28)

1. The customer adds `mybusiness.com` and gets exact records:
   - TXT `_fodo.mybusiness.com` = `fodo-verify=…` (ownership)
   - CNAME `www` → `<SITES_PROJECT>.pages.dev`
   - Optional CNAME/ALIAS for the root
2. The guide has provider-specific steps for GoDaddy, Namecheap, Cloudflare (DNS only, grey cloud), Hostinger, Squarespace/Google Domains, Bluehost and others. FODO never asks for registrar passwords.
3. **Verify** runs real DNS-over-HTTPS lookups (Cloudflare 1.1.1.1) for TXT, CNAME and NS, and explains exactly what is wrong (for example "www points to X — change it to Y").
4. When DNS is correct and `CF_API_TOKEN` + `CF_ACCOUNT_ID` are set, the domain is attached to the **sites** Pages project through the Cloudflare API. Cloudflare issues SSL automatically, and the status moves from 🟡 propagating to 🟢 connected (SSL ACTIVE). Without the token the status says so; nothing is faked.
5. A domain can belong to only one website. FODO's own domains can't be claimed.

## Setup

1. Create a Pages project `fodo-sites` with root directory `sites/` and bindings `XRAY_DB` (same D1).
2. Add the custom domain `sites.fodo.co.in`.
3. On the main project, set `SITES_HOST=sites.fodo.co.in` and `SITES_PROJECT=fodo-sites`.
4. On the main project, add the secrets `CF_API_TOKEN` (permission: Cloudflare Pages Edit) and `CF_ACCOUNT_ID`.
