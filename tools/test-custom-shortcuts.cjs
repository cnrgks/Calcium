'use strict';
const assert=require('assert'),api=require('../custom-shortcuts');
const siteCommands=api.saveRule('site',[],{trigger:'!y',url:'https://www.youtube.com/',searchUrl:'https://www.youtube.com/results?search_query={query}'}),textReplacements=api.saveRule('text',[],{trigger:'#adres',value:'My address'}),options={siteCommands,textReplacements,searchUrl:'https://search.test/?q='};
assert.equal(api.resolveInput('!y',options).url,'https://www.youtube.com/');assert.equal(api.resolveInput('!Y doğa & video',options).url,'https://www.youtube.com/results?search_query='+encodeURIComponent('doğa & video'));assert.deepEqual(api.resolveInput('#adres',options),{kind:'text',value:'My address'});assert.equal(api.resolveInput('!unknown query',options).kind,'search');
assert.throws(()=>api.saveRule('site',siteCommands,siteCommands[0]));assert.throws(()=>api.saveRule('site',[],{trigger:'bad space',url:'https://test.com'}));assert.throws(()=>api.saveRule('site',[],{trigger:'a',url:'javascript:alert(1)'}));assert.throws(()=>api.saveRule('site',[],{trigger:'a',url:'https://test.com',searchUrl:'https://test.com/{query}/{query}'}));assert.equal(api.normalizeRules('text',[...textReplacements,...textReplacements]).length,1);
assert.deepEqual(api.suggestions([{url:'https://visited.test',title:'Visited'},{query:'nature videos'}],'visited').items,[]);assert.equal(api.suggestions([{query:'nature videos'}],'nature').items[0].value,'nature videos');assert.equal(api.suggestions([{query:'nature videos'}],'nature').inline,'');
const visited=api.browsingSuggestions([{url:'https://www.youtube.com/',title:'YouTube'},{url:'https://www.youtube.com/',title:'YouTube'}],[{query:'youtube music'}],'you');
assert.equal(visited.items.filter(x=>x.url).length,1);assert.equal(visited.inline,'youtube.com/');assert(visited.items.some(x=>x.value==='youtube music'));assert.equal(api.browsingSuggestions([],[],'youtube').items.length,0);assert.equal(api.browsingSuggestions([{url:'javascript:alert(1)',title:'YouTube'}],[],'youtube').items.length,0);
const modHistory=[{url:'https://modrinth.com/',title:'Modrinth how to'}];
assert.equal(api.browsingSuggestions(modHistory,[],'mod').inline,'modrinth.com/');
for(const query of ['mod ','mod  ','mod how to',' mod','mod\t']){
 const result=api.browsingSuggestions(modHistory,[],query);
 assert.equal(result.inline,'','whitespace must not complete a URL: '+JSON.stringify(query));
 assert.equal(result.items.length,1,'matching history remains available');
}
const en=require('../i18n');for(const text of ['Sekmeyi uyut','Özel kısayollar','Bu siteyi çerez temizliğinden koru'])assert.notEqual(en.translate(text,'en'),text);
console.log('PASS: custom site/text rules, encoded searches, no defaults, strict URL validation, duplicates and search-only suggestions.');
