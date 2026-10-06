import json,os,urllib.request,time
time.sleep(65)
tweets=json.load(open('tweets.json')); sysp=open('prompt-live.md').read()
schema={"type":"object","properties":{"tweets":{"type":"array","items":{"type":"object","properties":{"id":{"type":"string"},"swaps":{"type":"array","items":{"type":"object","properties":{"o":{"type":"string"},"f":{"type":"string"},"g":{"type":"string"},"h":{"type":"string"},"ctx":{"type":"string"}},"required":["o","f","g","h","ctx"]}}},"required":["id","swaps"]}}},"required":["tweets"]}
out={}; errs=[]
for bi in range(0,27,9):
    batch=[{"id":k,"text":v} for k,v in tweets[bi:bi+9]]
    body={"systemInstruction":{"parts":[{"text":sysp}]},"contents":[{"role":"user","parts":[{"text":"Tweets:\n"+json.dumps(batch,ensure_ascii=False)}]}],"generationConfig":{"responseMimeType":"application/json","responseSchema":schema,"thinkingConfig":{"thinkingLevel":"minimal"}}}
    req=urllib.request.Request("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key="+os.environ['GEMINI_API_KEY'],data=json.dumps(body).encode(),headers={'Content-Type':'application/json'})
    try:
        r=json.load(urllib.request.urlopen(req,timeout=60)); d=json.loads(r['candidates'][0]['content']['parts'][0]['text'])
        for x in d['tweets']:
            if x['swaps']: out[x['id']]=[{kk:s[kk].strip() for kk in s} for s in x['swaps']]
    except Exception as e: errs.append(getattr(e,'code',None) or str(e)[:40])
    time.sleep(3)
json.dump(out,open('swaps.json','w'),ensure_ascii=False)
tm=dict(tweets)
print(f"{sum(len(v) for v in out.values())} swaps in {len(out)}/27 tweets; errors {errs}")
for k,v in out.items(): print("-", tm[k][:55].replace("\n"," "), "::", "; ".join(f"{s['o']}->{s['f']} [{s['ctx']}]" for s in v))
