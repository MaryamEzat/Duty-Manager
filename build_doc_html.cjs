const fs=require('fs');
const md=fs.readFileSync('Duty_Manager_Project_Documentation.md','utf8').replace(/\r/g,'');
const esc=s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const inline=s=>esc(s).replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/`(.+?)`/g,'<code>$1</code>');
let lines=md.split('\n');
let start=lines.indexOf('## Document purpose');
let out=[];
let inUl=false,inOl=false;
function closeLists(){if(inUl){out.push('</ul>');inUl=false}if(inOl){out.push('</ol>');inOl=false}}
for(let i=start;i<lines.length;){
  let l=lines[i];
  if(l==='## Contents'){while(i<lines.length&&lines[i]!=='---')i++;i++;continue}
  if(!l.trim()||l==='---'){closeLists();i++;continue}
  if(l.startsWith('|')){
    closeLists();let raw=[];while(i<lines.length&&lines[i].startsWith('|'))raw.push(lines[i++]);
    let rows=raw.map(x=>x.slice(1,-1).split('|').map(y=>y.trim())).filter(r=>!r.every(c=>/^:?-{3,}:?$/.test(c)));
    if(rows.length){out.push('<table><thead><tr>'+rows[0].map(c=>'<th>'+inline(c)+'</th>').join('')+'</tr></thead><tbody>');for(const r of rows.slice(1))out.push('<tr>'+r.map(c=>'<td>'+inline(c)+'</td>').join('')+'</tr>');out.push('</tbody></table>')}
    continue;
  }
  if(l.startsWith('# ')){closeLists();out.push('<h1>'+inline(l.slice(2))+'</h1>');i++;continue}
  if(l.startsWith('## ')){closeLists();out.push('<h1>'+inline(l.slice(3))+'</h1>');i++;continue}
  if(l.startsWith('### ')){closeLists();out.push('<h2>'+inline(l.slice(4))+'</h2>');i++;continue}
  if(l.startsWith('#### ')){closeLists();out.push('<h3>'+inline(l.slice(5))+'</h3>');i++;continue}
  if(/^- \[ \]/.test(l)){closeLists();out.push('<p class="check">☐ '+inline(l.replace(/^- \[ \]\s*/,''))+'</p>');i++;continue}
  if(/^- /.test(l)){if(inOl){out.push('</ol>');inOl=false}if(!inUl){out.push('<ul>');inUl=true}out.push('<li>'+inline(l.slice(2))+'</li>');i++;continue}
  if(/^\d+\. /.test(l)){if(inUl){out.push('</ul>');inUl=false}if(!inOl){out.push('<ol>');inOl=true}out.push('<li>'+inline(l.replace(/^\d+\. /,''))+'</li>');i++;continue}
  closeLists();out.push('<p>'+inline(l)+'</p>');i++;
}
closeLists();
const contents=['1. Executive Summary','2. Project Overview','3. Business Objectives','4. Current Project Status','5. Functional Scope','6. Solution Architecture','7. Technology Stack','8. GitHub Repository and Source Control','9. Application Structure','10. Application Modules and Screens','11. Dataverse Data Model','12. Data Sources and Integrations','13. Automated KPIs and Calculations','14. Business Logic and Lifecycle Rules','15. Business Unit and Country Logic','16. User Workflows','17. Automation and Scheduled Processes','18. Reporting and Export','19. Security and Access Control','20. Deployment and Environment Configuration','21. Completed Work','22. Current Outstanding Item','23. Dependencies, Risks, and Limitations','24. Recommended Next Steps','25. Management Handover Summary','Appendices A–D'];
const html=`<!doctype html><html><head><meta charset="utf-8"><style>
@page{size:letter;margin:.7in .72in .68in}.cover{page-break-after:always;text-align:center;padding-top:1.15in}.cover h1{font:700 30pt Aptos;color:#000;margin:0 0 8pt}.cover h2{font:400 16pt Aptos;color:#4a5c49;margin:0 0 28pt}.cover table{width:90%;margin:36pt auto 24pt;text-align:left}.contents{page-break-after:always}.contents-grid{columns:2;column-gap:30pt}.contents-grid p{break-inside:avoid;margin:0 0 7pt}body{font:9.5pt Aptos,Arial,sans-serif;color:#111;line-height:1.14}h1{font:700 17pt "Aptos Display",Arial;color:#000;margin:13pt 0 6pt;page-break-after:avoid}h2{font:700 13pt "Aptos Display",Arial;color:#000;margin:10pt 0 4pt;page-break-after:avoid}h3{font:700 11pt Aptos,Arial;color:#000;margin:8pt 0 3pt;page-break-after:avoid}p{margin:0 0 5pt}ul,ol{margin:2pt 0 6pt 20pt;padding:0}li{margin-bottom:2pt}table{border-collapse:collapse;width:100%;margin:5pt 0 9pt;font-size:8pt;page-break-inside:auto}thead{display:table-header-group}tr{page-break-inside:avoid}th{background:#2e372d;color:#fff;font-weight:700;text-align:left;border:1px solid #d9d9d9;padding:4pt}td{border:1px solid #d9d9d9;padding:4pt;vertical-align:top}tbody tr:nth-child(even){background:#f7f5ef}code{font-family:Consolas;font-size:8.5pt;background:#f2f2f2}.check{margin-left:12pt}strong{font-weight:700}a{color:#2e5e45;text-decoration:none}.status{font-weight:700;color:#2e5e45}
</style></head><body>
<div class="cover"><h1>DUTY MANAGER</h1><h2>Complete Project Documentation<br>and Handover Report</h2><table><tr><th>Document date</th><td>13 October 2026</td></tr><tr><th>Application status</th><td>Development completed</td></tr><tr><th>Primary outstanding item</th><td>Final report structure confirmation</td></tr><tr><th>Source of truth</th><td>Current React/TypeScript repository</td></tr><tr><th>Repository</th><td>github.com/MaryamEzat/Duty-Manager</td></tr></table><p>Prepared for project sponsors, operational owners, Power Platform administrators,<br>support teams, and future development teams.</p></div>
<div class="contents"><h1>Contents</h1><div class="contents-grid">${contents.map(x=>'<p>'+x+'</p>').join('')}</div></div>
${out.join('\n')}</body></html>`;
fs.writeFileSync('Duty_Manager_Project_Documentation.html',html);
