#!/usr/bin/env python3
"""Adds a READ-ONLY 'discover' mode to the V2-built issuer IPC (issuer_ipc.py + issuer_ipc_client.py).

discover {mode, operation_id:'nyxa-delegation-frame-v2', proposal_id} -> {ok, grant_id, proposal_id}
returns the grant id ONLY if exactly one issued, unclaimed grant exists whose pinned frame transaction carries
that proposal_id and whose Ed25519 signature/claims verify (same verify_grant as inspect/claim). It never claims,
never moves files and never widens the peer allowlist (same SO_PEERCRED check). Purpose: removes the manual
grant-id hand-over; claiming still goes through the unchanged one-use claim path.
Usage: discover_patch.py <built-output-dir>   (exact anchors; prints PATCH_OK or fails)
"""
import sys
from pathlib import Path

def once(text, old, new):
    if text.count(old) != 1:
        raise SystemExit(f'ANCHOR_MISMATCH: {old[:60]!r} x{text.count(old)}')
    return text.replace(old, new, 1)

SERVER_FN = '''def discover(cfg,request,trust):
    # R8 read-only discovery: proposal_id -> exactly one verified, issued, unclaimed frame grant.
    if not isinstance(request,dict) or set(request)!={'mode','operation_id','proposal_id'}:refuse('request_shape')
    op=request['operation_id'];pid=request['proposal_id']
    if op!='nyxa-delegation-frame-v2' or not cfg.get('frame_transactions') or not isinstance(pid,str) or not UUID.fullmatch(pid):
        refuse('discover_not_allowed')
    catalog,pub,root=trust
    folder=root/'frame-transactions'
    safe_dir(folder,os.geteuid())
    found=[]
    for f in sorted(folder.iterdir()):
        gid=f.name[:-5]
        if not f.name.endswith('.json') or not UUID.fullmatch(gid):continue
        try:
            tx=read_frame_transaction(cfg,root,gid)
            if tx['proposal_id']!=pid:continue
            issued=root/'issued'/(gid+'.json')
            if not issued.exists() or (root/'claimed'/(gid+'.json')).exists():continue
            safe_file(issued,{os.geteuid()})
            verify_grant(json.loads(issued.read_text()),tx,gid,pub)
        except Exception:
            continue
        found.append(gid)
    if not found:refuse('no_confirmed_grant')
    if len(found)>1:refuse('ambiguous_grants')
    return {'ok':True,'grant_id':found[0],'proposal_id':pid}
def serve(cfg,trust,once=False):'''

def patch(out: Path):
    s = (out / 'issuer_ipc.py').read_text()
    s = once(s, 'def serve(cfg,trust,once=False):', SERVER_FN)
    s = once(s, '                    result=claim(cfg,request,load_trust(cfg))',
             "                    result=(discover if isinstance(request,dict) and request.get('mode')=='discover' else claim)(cfg,request,load_trust(cfg))")
    (out / 'issuer_ipc.py').write_text(s)
    c = (out / 'issuer_ipc_client.py').read_text()
    c = once(c, "    if mode not in ('inspect','claim') or operation_id not in cfg['operations'] or not ID.fullmatch(grant_id):",
             "    if mode not in ('inspect','claim','discover') or operation_id not in cfg['operations'] or not ID.fullmatch(grant_id):")
    c = once(c, "    req={'mode':mode,'grant_id':grant_id,'operation_id':operation_id}",
             "    req={'mode':mode,'operation_id':operation_id,**({'proposal_id':grant_id} if mode=='discover' else {'grant_id':grant_id})}")
    c = once(c, """    if not isinstance(response,dict) or set(response) not in [
        {'ok','envelope'},{'ok','reason'}]:""", """    if mode=='discover' and isinstance(response,dict) and set(response)=={'ok','grant_id','proposal_id'} and response['ok'] is True:
        if not ID.fullmatch(str(response['grant_id'])) or response['proposal_id']!=grant_id:refuse('issuer_response_schema')
        return response
    if not isinstance(response,dict) or set(response) not in [
        {'ok','envelope'},{'ok','reason'},{'ok','envelope','transaction'}]:""")
    if "choices=['inspect','claim']" in c:
        c = once(c, "choices=['inspect','claim']", "choices=['inspect','claim','discover']")
    (out / 'issuer_ipc_client.py').write_text(c)
    print('PATCH_OK')

if __name__ == '__main__':
    patch(Path(sys.argv[1]))
