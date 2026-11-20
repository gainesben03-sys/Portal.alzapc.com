// The page a one-click link opens. It does nothing until it runs in a browser (so email
// scanners that only fetch the page don't use the link up), then signs in and opens the page.
import { RETURN_KEY_NAME } from "@/lib/oneclickpage";
import { LINK_DAYS } from "@/lib/oneclick";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = JSON.stringify(token).replace(/</g, "\\u003c");
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Alza Hub</title>
<style>body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;background:#f7f5f0;color:#19283c;display:grid;place-items:center;min-height:100vh}.c{background:#fff;border:1px solid #e6e1d6;border-radius:16px;padding:28px 24px;max-width:380px;margin:16px;text-align:center}h1{font-family:Georgia,serif;font-weight:600;font-size:22px;margin:0 0 8px}p{color:#5b6b85;font-size:15px;line-height:1.5;margin:0 0 16px}button{font:inherit;font-weight:700;background:#19283c;color:#fff;border:0;border-radius:10px;padding:12px 18px;cursor:pointer;width:100%}button:disabled{opacity:.6}.s{width:28px;height:28px;border:3px solid #e6e1d6;border-top-color:#19283c;border-radius:50%;margin:6px auto 14px;animation:r 0.8s linear infinite}@keyframes r{to{transform:rotate(360deg)}}@media (prefers-color-scheme:dark){body{background:#12161d;color:#e8e4dc}.c{background:#1b212b;border-color:#2c3440}p{color:#a8b0bd}button{background:#e8e4dc;color:#12161d}}</style></head>
<body><div class="c" id="c"><div class="s"></div><h1>Opening the Alza Hub…</h1><p>One moment.</p></div>
<script>
(function(){
  var token=${t}, box=document.getElementById("c");
  function show(h,p,btn){box.innerHTML='<h1>'+h+'</h1><p>'+p+'</p>'+(btn?'<button id="b">Email me a new link</button>':'');var b=document.getElementById("b");if(b)b.onclick=function(){b.disabled=true;b.textContent="Sending…";fetch("/api/go",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token:token,action:"resend"})}).then(function(){show("Check your email","A new link is on its way. It opens right where you left off.",false)}).catch(function(){b.disabled=false;b.textContent="Try again"})}}
  fetch("/api/go",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token:token,action:"open"})}).then(function(r){return r.json()}).then(function(r){
    if(r.ok){try{localStorage.setItem("${RETURN_KEY_NAME}",JSON.stringify({path:r.path,at:Date.now()}))}catch(e){}location.replace(r.link);return}
    if(r.reason==="used")return show("This link was already used","Links in emails work once, to keep your team's information safe.",true);
    if(r.reason==="expired")return show("This link has expired","Links in emails last ${LINK_DAYS} days.",true);
    if(r.reason==="no_access")return show("No access","This email doesn't have access to the Alza Hub anymore. Ask HR if that's a mistake.",false);
    show("That link didn't work","It may have been cut off. Try the button in the email again, or ask for a new one.",r.reason!=="bad");
  }).catch(function(){show("Can't reach the Alza Hub","Check your connection and try again.",false)});
})();
</script></body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}
