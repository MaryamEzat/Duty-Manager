const fs=require('fs'),path=require('path');
const root=path.join(process.cwd(),'.docxbuild');
fs.rmSync(root,{recursive:true,force:true});
for(const d of ['_rels','word','word/_rels','docProps'])fs.mkdirSync(path.join(root,d),{recursive:true});
const md=fs.readFileSync('Duty_Manager_Project_Documentation.md','utf8').replace(/\r/g,'');
const x=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
function runs(s,opt={}){
  s=String(s).replace(/`/g,'');
  const parts=s.split(/(\*\*.*?\*\*|Requires confirmation)/gi);
  return parts.filter(Boolean).map(part=>{
    let bold=!!opt.bold,color=opt.color||'111111';
    if(/^\*\*.*\*\*$/.test(part)){bold=true;part=part.slice(2,-2)}
    if(/^Requires confirmation$/i.test(part))color='9C0006';
    const pr='<w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos"/>'+(bold?'<w:b/>':'')+(opt.size?'<w:sz w:val="'+opt.size+'"/><w:szCs w:val="'+opt.size+'"/>':'')+'<w:color w:val="'+color+'"/></w:rPr>';
    return '<w:r>'+pr+'<w:t xml:space="preserve">'+x(part)+'</w:t></w:r>';
  }).join('');
}
function para(s,style='Normal',opt={}){
  const pp='<w:pPr><w:pStyle w:val="'+style+'"/>'+(opt.center?'<w:jc w:val="center"/>':'')+(opt.keep?'<w:keepNext/>':'')+(opt.before?'<w:spacing w:before="'+opt.before+'"/>':'')+(opt.after!==undefined?'<w:spacing w:after="'+opt.after+'"/>':'')+'</w:pPr>';
  return '<w:p>'+pp+runs(s,opt)+'</w:p>';
}
function pageBreak(){return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>'}
function cell(text,opt={}){
 const shade=opt.shade?'<w:shd w:val="clear" w:color="auto" w:fill="'+opt.shade+'"/>':'';
 const tcpr='<w:tcPr><w:tcW w:w="'+(opt.width||3000)+'" w:type="dxa"/>'+shade+'<w:vAlign w:val="center"/></w:tcPr>';
 return '<w:tc>'+tcpr+para(text,'TableText',{bold:opt.bold,color:opt.color||'111111',after:0})+'</w:tc>';
}
function table(rows,opt={}){
 const cols=Math.max(...rows.map(r=>r.length)),width=Math.floor(9750/cols);
 let xml='<w:tbl><w:tblPr><w:tblW w:w="9750" w:type="dxa"/><w:tblLayout w:type="fixed"/>';
 if(opt.borderless)xml+='<w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders>';
 else xml+='<w:tblBorders><w:top w:val="single" w:sz="4" w:color="D9D9D9"/><w:left w:val="single" w:sz="4" w:color="D9D9D9"/><w:bottom w:val="single" w:sz="4" w:color="D9D9D9"/><w:right w:val="single" w:sz="4" w:color="D9D9D9"/><w:insideH w:val="single" w:sz="4" w:color="D9D9D9"/><w:insideV w:val="single" w:sz="4" w:color="D9D9D9"/></w:tblBorders>';
 xml+='</w:tblPr><w:tblGrid>'+Array(cols).fill('<w:gridCol w:w="'+width+'"/>').join('')+'</w:tblGrid>';
 rows.forEach((row,ri)=>{
   xml+='<w:tr><w:trPr><w:cantSplit/>'+(ri===0&&!opt.noHeader?'<w:tblHeader/>':'')+'</w:trPr>';
   for(let ci=0;ci<cols;ci++)xml+=cell(row[ci]||'',{width,shade:ri===0&&!opt.noHeader?'2E372D':(ri%2===0?'F7F5EF':null),bold:ri===0&&!opt.noHeader,color:ri===0&&!opt.noHeader?'FFFFFF':'111111'});
   xml+='</w:tr>';
 });
 return xml+'</w:tbl>'+para('','Normal',{after:0});
}
let body=[];
body.push(para('DUTY MANAGER','CoverTitle',{center:true,bold:true,after:100}));
body.push(para('Complete Project Documentation','CoverSubtitle',{center:true,after:40}));
body.push(para('and Handover Report','CoverSubtitle',{center:true,after:500}));
body.push(table([
 ['Document date','13 October 2026'],
 ['Application status','Development completed'],
 ['Primary outstanding item','Final report structure confirmation'],
 ['Source of truth','Current React/TypeScript repository'],
 ['Repository','github.com/MaryamEzat/Duty-Manager']
]));
body.push(para('Prepared for project sponsors, operational owners, Power Platform administrators, support teams, and future development teams.','Normal',{center:true,before:300}));
body.push(pageBreak());
body.push(para('Contents','Title',{bold:true,after:200}));
const contents=['1. Executive Summary','2. Project Overview','3. Business Objectives','4. Current Project Status','5. Functional Scope','6. Solution Architecture','7. Technology Stack','8. GitHub Repository and Source Control','9. Application Structure','10. Application Modules and Screens','11. Dataverse Data Model','12. Data Sources and Integrations','13. Automated KPIs and Calculations','14. Business Logic and Lifecycle Rules','15. Business Unit and Country Logic','16. User Workflows','17. Automation and Scheduled Processes','18. Reporting and Export','19. Security and Access Control','20. Deployment and Environment Configuration','21. Completed Work','22. Current Outstanding Item','23. Dependencies, Risks, and Limitations','24. Recommended Next Steps','25. Management Handover Summary','Appendices A-D'];
let toc=[];for(let i=0;i<contents.length;i+=2)toc.push([contents[i],contents[i+1]||'']);
body.push(table(toc,{borderless:true,noHeader:true}));
body.push(pageBreak());
const lines=md.split('\n');let i=lines.indexOf('## Document purpose');
while(i<lines.length){
 let l=lines[i];
 if(l==='## Contents'){while(i<lines.length&&lines[i]!=='---')i++;i++;continue}
 if(!l.trim()||l==='---'){i++;continue}
 if(l.startsWith('|')){
   let raw=[];while(i<lines.length&&lines[i].startsWith('|'))raw.push(lines[i++]);
   const rows=raw.map(v=>v.slice(1,-1).split('|').map(c=>c.trim())).filter(r=>!r.every(c=>/^:?-{3,}:?$/.test(c)));
   if(rows.length)body.push(table(rows));continue;
 }
 if(l.startsWith('# ')){body.push(para(l.slice(2),'Heading1',{bold:true,keep:true}));i++;continue}
 if(l.startsWith('## ')){body.push(para(l.slice(3),'Heading1',{bold:true,keep:true}));i++;continue}
 if(l.startsWith('### ')){body.push(para(l.slice(4),'Heading2',{bold:true,keep:true}));i++;continue}
 if(l.startsWith('#### ')){body.push(para(l.slice(5),'Heading3',{bold:true,keep:true}));i++;continue}
 if(/^- \[ \]/.test(l)){body.push(para('☐ '+l.replace(/^- \[ \]\s*/,''),'ListParagraph'));i++;continue}
 if(/^- /.test(l)){body.push(para('•  '+l.slice(2),'ListParagraph'));i++;continue}
 if(/^\d+\. /.test(l)){body.push(para(l,'ListParagraph'));i++;continue}
 body.push(para(l));i++;
}
const sect='<w:sectPr><w:headerReference w:type="default" r:id="rId1"/><w:footerReference w:type="default" r:id="rId2"/><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="980" w:right="1037" w:bottom="936" w:left="1037" w:header="432" w:footer="432" w:gutter="0"/></w:sectPr>';
const doc='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>'+body.join('')+sect+'</w:body></w:document>';
const styles='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'+
'<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos"/><w:sz w:val="19"/><w:szCs w:val="19"/><w:color w:val="111111"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="100" w:line="270" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>'+
'<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>'+
'<w:style w:type="paragraph" w:styleId="CoverTitle"><w:name w:val="Cover Title"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="1800" w:after="100"/></w:pPr><w:rPr><w:rFonts w:ascii="Aptos Display" w:hAnsi="Aptos Display"/><w:b/><w:sz w:val="60"/></w:rPr></w:style>'+
'<w:style w:type="paragraph" w:styleId="CoverSubtitle"><w:name w:val="Cover Subtitle"/><w:basedOn w:val="Normal"/><w:rPr><w:rFonts w:ascii="Aptos Display" w:hAnsi="Aptos Display"/><w:color w:val="4A5C49"/><w:sz w:val="32"/></w:rPr></w:style>'+
'<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="100" w:after="160"/></w:pPr><w:rPr><w:rFonts w:ascii="Aptos Display" w:hAnsi="Aptos Display"/><w:b/><w:sz w:val="38"/></w:rPr></w:style>'+
'<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="100"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:rFonts w:ascii="Aptos Display" w:hAnsi="Aptos Display"/><w:b/><w:sz w:val="34"/></w:rPr></w:style>'+
'<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="180" w:after="80"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:rFonts w:ascii="Aptos Display" w:hAnsi="Aptos Display"/><w:b/><w:sz w:val="26"/></w:rPr></w:style>'+
'<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="140" w:after="60"/><w:outlineLvl w:val="2"/></w:pPr><w:rPr><w:b/><w:sz w:val="22"/></w:rPr></w:style>'+
'<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="300" w:hanging="180"/><w:spacing w:after="50"/></w:pPr></w:style>'+
'<w:style w:type="paragraph" w:styleId="TableText"><w:name w:val="Table Text"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="0" w:line="230" w:lineRule="auto"/></w:pPr><w:rPr><w:sz w:val="16"/></w:rPr></w:style></w:styles>';
const header='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos"/><w:b/><w:color w:val="4A5C49"/><w:sz w:val="16"/></w:rPr><w:t>DUTY MANAGER  |  PROJECT DOCUMENTATION &amp; HANDOVER</w:t></w:r></w:p></w:hdr>';
const footer='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos"/><w:color w:val="696969"/><w:sz w:val="16"/></w:rPr><w:t xml:space="preserve">Confidential - Internal Project Handover     Page </w:t></w:r><w:fldSimple w:instr=" PAGE "><w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:t>1</w:t></w:r></w:fldSimple></w:p></w:ftr>';
const types='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>';
const rels='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>';
const docrels='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/></Relationships>';
const settings='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:zoom w:percent="100"/><w:defaultTabStop w:val="720"/><w:updateFields w:val="true"/></w:settings>';
const core='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>Duty Manager Project Documentation and Handover Report</dc:title><dc:creator>Duty Manager Project Team</dc:creator><dc:subject>Complete functional and technical handover</dc:subject><dcterms:created xsi:type="dcterms:W3CDTF">2026-10-13T00:00:00Z</dcterms:created></cp:coreProperties>';
const app='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Microsoft Office Word</Application><Company></Company></Properties>';
for(const [f,v] of [['[Content_Types].xml',types],['_rels/.rels',rels],['word/document.xml',doc],['word/styles.xml',styles],['word/settings.xml',settings],['word/header1.xml',header],['word/footer1.xml',footer],['word/_rels/document.xml.rels',docrels],['docProps/core.xml',core],['docProps/app.xml',app]])fs.writeFileSync(path.join(root,f),v);
console.log(root);
