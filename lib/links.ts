/** The participant ID is permanent; only the current origin changes between domains. */
export function saleUrl(origin:string, participantId:string){
  return new URL('/?b='+encodeURIComponent(participantId),origin).href;
}
/** Keep OAuth return navigation on this app, including browser backslash normalization. */
export function safeReturnPath(value:string|null){
  if(!value||!value.startsWith('/')||value.startsWith('//')||/[\\\u0000-\u001f]/.test(value)||value.startsWith('/auth/')||value.startsWith('/login'))return '/';
  return value;
}


export function participantPanelUrl(origin:string, panelKey:string){
  return new URL('/participante#'+encodeURIComponent(panelKey),origin).href;
}
