import {firebaseConfig,ownerUid} from './firebase-config.js';
import {validateState} from './engine.js';
export const configured=Boolean(firebaseConfig?.apiKey&&firebaseConfig?.projectId);
let auth,db,f,au,user=null,unsubscribe=null,revision=0,ready=false,handler;
export async function connect(onChange){
 handler=onChange;if(!configured){handler({status:'local'});return;}
 try{
 const root='https://www.gstatic.com/firebasejs/13.4.0/';
 const [app,a,fire]=await Promise.all([import(root+'firebase-app.js'),import(root+'firebase-auth.js'),import(root+'firebase-firestore.js')]);
 au=a;f=fire;const instance=app.initializeApp(firebaseConfig);auth=a.getAuth(instance);db=f.getFirestore(instance);
 await a.setPersistence(auth,a.browserSessionPersistence);
 a.onAuthStateChanged(auth,async u=>{
  if(unsubscribe)unsubscribe();ready=false;user=u;revision=0;
  if(!u){handler({status:'signedout'});return;}
  if(!ownerUid){handler({status:'needowner',uid:u.uid});return;}
  if(u.uid!==ownerUid){handler({status:'denied'});return;}
  handler({status:'loading'});
  unsubscribe=f.onSnapshot(f.doc(db,'users',u.uid,'finance','main'),snapshot=>{
   if(snapshot.metadata.hasPendingWrites)return;
   const data=snapshot.data();if(data){try{validateState(data.state);revision=data.revision;ready=true;handler({status:'ready',state:data.state,uid:u.uid,revision});}catch{ready=false;handler({status:'error',message:'O arquivo remoto não passou na validação. Exporte teu backup e confira a versão.'});}}
   else {revision=0;ready=true;handler({status:'empty',uid:u.uid});}
  },error=>{ready=false;handler({status:'error',message:message(error)});});
 });
 }catch(e){handler({status:'error',message:message(e)});}
}
export async function login(){if(!auth)throw Error('Firebase não carregou. Confira a conexão.');return au.signInWithPopup(auth,new au.GoogleAuthProvider());}
export async function logout(){if(unsubscribe)unsubscribe();ready=false;return au.signOut(auth);}
export async function saveRemote(state){
 if(!ready||!user||user.uid!==ownerUid)throw Error('Entre na tua conta e aguarde a sincronização.');
 if(!navigator.onLine)throw Error('Sem internet. Nenhum registro foi enviado. Tenta novamente quando conectar.');
 validateState(state);const expected=revision,ref=f.doc(db,'users',user.uid,'finance','main');
 return f.runTransaction(db,async tx=>{const snapshot=await tx.get(ref);const remote=snapshot.data();if((remote?.revision??0)!==expected)throw Error('Outro dispositivo atualizou os dados. Aguarde atualizar a tela e repita o lançamento.');const nextRevision=expected+1;tx.set(ref,{state,revision:nextRevision,updatedAt:f.serverTimestamp()});return nextRevision;});
}
function message(e){if(e.code?.includes('permission-denied'))return 'Acesso bloqueado. Confira o UID e as regras do Firestore.';if(e.code?.includes('unauthorized-domain'))return 'Adicione este domínio aos domínios autorizados do Firebase Authentication.';if(e.code?.includes('popup-blocked'))return 'Permita a janela de login do Google neste navegador.';return e.message||'Não foi possível sincronizar. Nenhuma gravação foi confirmada.';}
