const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');
function fixture() {
 const handlers={}, fields={};for(const name of ['button_url','key_id','secret_key','webhook_key_id','webhook_secret_key','same_webhook_key','enabled'])fields[name]={value:'',checked:false,addEventListener:(event,fn)=>handlers[name+event]=fn};
 const button={disabled:false},message={textContent:''},webhookFields={hidden:true};
 const form={elements:fields,querySelector:()=>button,addEventListener:(event,fn)=>handlers[event]=fn};
 const root={innerHTML:'',querySelector(selector){return {'[data-fygaro-form]':form,'[data-fygaro-message]':message,'[data-webhook-fields]':webhookFields,'[data-copy-hook]':{addEventListener:(event,fn)=>handlers.copy=fn}}[selector]}};
 const scope={window:{},navigator:{clipboard:{writeText:async()=>{}}}};vm.runInNewContext(fs.readFileSync('js/developer-fygaro.js','utf8'),scope);
 return {api:scope.window.GraceFygaroSettings,root,fields,handlers,button,message};
}
test('Fygaro setup posts secrets once and clears browser fields, without pre-filling stored secrets',async()=>{
 const x=fixture();let sent;
 const data={enabled:false,configured:true,has_secret:true,has_webhook_secret:true,same_webhook_key:true,button_url:'https://www.fygaro.com/en/pb/example',key_id:'test-key',webhook_url:'https://example.test/hook'};
 const client={functions:{invoke:async(name,args)=>{sent={name,body:JSON.parse(JSON.stringify(args.body))};assert.equal(x.fields.secret_key.value,'');return {data};}}};
 x.api.render(x.root,data,client);assert.ok(!x.root.innerHTML.includes('value="secret'));assert.match(x.root.innerHTML,/Leave blank to keep/);
 x.fields.button_url.value=data.button_url;x.fields.key_id.value='new-key';x.fields.secret_key.value='new-test-secret';x.fields.same_webhook_key.checked=true;
 await x.handlers.submit({preventDefault(){}});
 assert.equal(sent.name,'developer-fygaro-settings');assert.equal(sent.body.action,'save');assert.equal(sent.body.config.secret_key,'new-test-secret');
 assert.equal(x.fields.secret_key.value,'');assert.ok(!x.root.innerHTML.includes('new-test-secret'));assert.match(x.message.textContent,/real test payment/);
});
test('failed payment configuration reports failure and allows a safe retry',async()=>{
 const x=fixture();x.api.render(x.root,{same_webhook_key:true},{functions:{invoke:async()=>({error:{context:{json:async()=>({error:'Only the platform owner can configure payments.'})}}})}});
 x.fields.secret_key.value='new-test-secret';await x.handlers.submit({preventDefault(){}});
 assert.equal(x.button.disabled,false);assert.equal(x.fields.secret_key.value,'');assert.match(x.message.textContent,/Only the platform owner/);
});
