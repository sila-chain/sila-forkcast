from pathlib import Path
import re, shutil

root = Path('target')
expected = Path('expected')

# Preserve target repository metadata and its already-approved Sila workflows.
workflows = Path('/tmp/sila_target_workflows')
if workflows.exists(): shutil.rmtree(workflows)
workflows.mkdir(parents=True)
if (root/'.github/workflows').exists():
    shutil.copytree(root/'.github/workflows', workflows, dirs_exist_ok=True)

for p in list(root.iterdir()):
    if p.name != '.git':
        if p.is_dir(): shutil.rmtree(p)
        else: p.unlink()
for p in expected.iterdir():
    if p.name == '.git': continue
    dst=root/p.name
    if p.is_dir(): shutil.copytree(p,dst)
    else: shutil.copy2(p,dst)

U='Ethereum'; u='ethereum'; UU='ETHEREUM'
EIPS='EIPs'; eips='eips'; EIP='EIP'; eip='eip'
ERCS='ERCs'; ercs='ercs'; ERC='ERC'; erc='erc'
ETH='ETH'; Eth='Eth'; eth='eth'; Ether='Ether'; ether='ether'
token_map={
 U:'Sila',u:'sila',UU:'SILA',EIPS:'SIPs',eips:'sips',EIP:'SIP',eip:'sip',
 ERCS:'SRCs',ercs:'srcs',ERC:'SRC',erc:'src',ETH:'SIL',Eth:'Sil',eth:'sil',Ether:'Sila',ether:'sila',
 'Mainnet':'SilaMainnet','mainnet':'sila-mainnet','MAINNET':'SILA_MAINNET',
 'Sepolia':'SilaSepolia','Holesky':'SilaHolesky','Deneb':'SilaDeneb','Fulu':'SilaFulu',
 'PeerDAS':'SilaPeerDAS','Cancun':'SilaCancun','Shanghai':'SilaShanghai','Prague':'SilaPrague',
 'Osaka':'SilaOsaka','Paris':'SilaParis','Amsterdam':'SilaAmsterdam','Kovan':'SilaKovan'}
literals=[
 ('https://eips.ethereum.org','https://sips.sila.org'),('eips.ethereum.org','sips.sila.org'),
 ('https://github.com/ethereum/','https://github.com/sila-chain/'),('github.com/ethereum/','github.com/sila-chain/'),
 ('https://ethereum.org','https://sila.org'),('ethereum.org','sila.org'),
 ('Ethereum Foundation','Sila Foundation'),('Etherscan','SilaScan'),
 ('WETH','WSIL'),('IWETH','IWSIL'),('IERC','ISRC'),('AERC','ASRC'),('IEIP','ISIP')]
rx=re.compile(r'\b(?:'+'|'.join(sorted(map(re.escape,token_map),key=len,reverse=True))+r')\b')
prx=re.compile(r'(?<![A-Za-z0-9])(?:'+'|'.join(sorted(map(re.escape,token_map),key=len,reverse=True))+r')(?![A-Za-z0-9])')
source_exts={'.ts','.tsx','.js','.jsx','.mjs','.cjs'}
sentinel='__SILA_MAINNET_IDENTIFIER__'

def binary(p):
 b=p.read_bytes()[:8192]
 if b'\x00' in b:return True
 try:b.decode('utf-8');return False
 except UnicodeDecodeError:return True

def protect_code_mainnet(s):
 out=[];i=0;state='code'
 while i<len(s):
  if state=='code':
   if s.startswith('//',i):out.append('//');i+=2;state='line';continue
   if s.startswith('/*',i):out.append('/*');i+=2;state='block';continue
   c=s[i]
   if c=="'":out.append(c);i+=1;state='single';continue
   if c=='"':out.append(c);i+=1;state='double';continue
   if c=='`':out.append(c);i+=1;state='template';continue
   if s.startswith('mainnet',i):
    before=s[i-1] if i else ''
    after=s[i+7] if i+7<len(s) else ''
    if (not before or not(before.isalnum() or before in '_$')) and (not after or not(after.isalnum() or after in '_$')):
     out.append(sentinel);i+=7;continue
   out.append(c);i+=1;continue
  c=s[i];out.append(c);i+=1
  if c=='\\' and state in {'single','double','template'} and i<len(s):out.append(s[i]);i+=1;continue
  if state=='single' and c=="'":state='code'
  elif state=='double' and c=='"':state='code'
  elif state=='template' and c=='`':state='code'
  elif state=='line' and c=='\n':state='code'
  elif state=='block' and c=='*' and i<len(s) and s[i]=='/':out.append('/');i+=1;state='code'
 return ''.join(out)

def protect_third_party_github(s):
 saved=[];pat=re.compile(r'https?://github\.com/([A-Za-z0-9_.-]+)')
 def repl(m):
  org=m.group(1)
  if org.lower().startswith('ethereum') and org.lower()!='ethereum':
   key=f'__SILA_TP_GITHUB_{len(saved)}__';saved.append((key,m.group(0)));return key
  return m.group(0)
 return pat.sub(repl,s),saved

for p in root.rglob('*'):
 if not p.is_file() or '.git' in p.parts or binary(p):continue
 s=p.read_text('utf-8');s,saved=protect_third_party_github(s)
 if p.suffix.lower() in source_exts:s=protect_code_mainnet(s)
 for a,b in literals:s=s.replace(a,b)
 s=rx.sub(lambda m:token_map[m.group(0)],s).replace(sentinel,'silaMainnet')
 for key,val in saved:s=s.replace(key,val)
 if p.as_posix().endswith('src/components/calls-index/CallsIndexTimeline.tsx'):
  s=re.sub(r'(?m)^(\s*)silaMainnet:',r"\1'sila-mainnet':",s)
 p.write_text(s,'utf-8')

for p in sorted([x for x in root.rglob('*') if '.git' not in x.parts],key=lambda x:len(x.parts),reverse=True):
 if not p.exists():continue
 n=prx.sub(lambda m:token_map[m.group(0)],p.name)
 if n!=p.name:
  q=p.with_name(n)
  if q.exists():raise SystemExit(f'PATH_COLLISION:{p}->{q}')
  p.rename(q)

# Workflows are governed separately; preserve the approved Sila versions byte-for-byte.
if (root/'.github/workflows').exists(): shutil.rmtree(root/'.github/workflows')
(root/'.github/workflows').mkdir(parents=True,exist_ok=True)
shutil.copytree(workflows,root/'.github/workflows',dirs_exist_ok=True)

ids=[U,u,UU,EIPS,eips,EIP,eip,ERCS,ercs,ERC,erc,ETH,Eth,eth,Ether,ether]
word=re.compile(r'\b(?:'+'|'.join(map(re.escape,ids))+r')\b')
gh=re.compile(r'github\.com/'+re.escape(u)+r'(?=/|$|[\s"\'<>),.;:#?])')
domains=re.compile(re.escape('eips.ethereum.org')+'|'+re.escape('ethereum.org'))
res=[]
for p in root.rglob('*'):
 if '.git' in p.parts:continue
 rel=p.relative_to(root).as_posix()
 if word.search(rel) or gh.search(rel) or domains.search(rel):res.append('PATH:'+rel)
 if p.is_file() and not binary(p):
  s=p.read_text('utf-8')
  masked=re.sub(r'https?://github\.com/'+re.escape(u)+r'[A-Za-z0-9_.-]+','__THIRD_PARTY_GITHUB__',s)
  if word.search(masked) or gh.search(masked) or domains.search(masked):res.append('TEXT:'+rel)
print('ACTIONABLE_IDENTITY_RESIDUAL_COUNT='+str(len(res)))
if res:
 print('\n'.join(res[:200]));raise SystemExit(1)
