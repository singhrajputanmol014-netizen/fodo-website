#!/usr/bin/env python3
"""Static audit: routes exist, no href="#"/empty (except JS-filled data-* links), local targets exist, title/desc/h1, button types, sitemap. Run from project root."""
import os,re,sys,glob
ROOT=os.getcwd(); fails=[]
routes=["index.html"]+[f"{d}/index.html" for d in "about services industries work insights resources growth-score roi-calculator fodo-challenge marketing-quiz contact reviews faq legal thank-you".split()]
routes+=sorted(glob.glob("services/*/index.html"))
for r in routes:
    if not os.path.exists(r) or os.path.getsize(r)<2000: fails.append(f"missing/empty {r}")
for f in routes+["404.html"]:
    h=open(f).read(); d=os.path.dirname(f)
    if not re.search(r"<title>[^<]+</title>",h): fails.append(f"{f}: no title")
    if 'name="description"' not in h: fails.append(f"{f}: no description")
    if len(re.findall(r"<h1",h))!=1: fails.append(f"{f}: h1 count {len(re.findall('<h1',h))}")
    for m in re.finditer(r"<a ([^>]*)>",h):
        a=m.group(1); href=re.search(r'href="([^"]*)"',a)
        if not href: fails.append(f"{f}: <a> without href"); continue
        v=href.group(1)
        if v in("","#","javascript:void(0)") and not re.search(r"data-(route|wa|mail|tel|li|ig)",a): fails.append(f"{f}: dead href '{v}'")
        if v.startswith(("http","mailto","tel","#","?")) or re.search(r"data-(route|wa|mail|tel|li|ig)",a) or f=="404.html": continue
        t=os.path.normpath(os.path.join(d,v.split("#")[0])); 
        if os.path.isdir(t): t=os.path.join(t,"index.html")
        if not os.path.exists(t): fails.append(f"{f}: broken local link {v}")
    for m in re.finditer(r"<button ([^>]*)>",h):
        if 'type="' not in m.group(1): fails.append(f"{f}: button without type")
sm=open("sitemap.xml").read(); n=sm.count("<loc>")
if n!=len(routes)-1 or "404" in sm or "thank-you" in sm: fails.append(f"sitemap has {n} routes")
for js in glob.glob("js/*.js"):
    s=open(js).read()
    for pat in ["/approach","/case-studies","/discount/","/cookies/"]:
        if pat in s: fails.append(f"{js}: references unbuilt route {pat}")
print(f"routes checked: {len(routes)} (+404) · sitemap entries: {n}")
print("\n".join(fails) if fails else "ALL STATIC CHECKS PASSED"); sys.exit(1 if fails else 0)
