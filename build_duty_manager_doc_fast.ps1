$ErrorActionPreference='Stop'
$html=(Resolve-Path '.\Duty_Manager_Project_Documentation.html').Path
$docx=Join-Path $env:TEMP 'Duty_Manager_Project_Documentation.docx'
$pdf=Join-Path $env:TEMP 'Duty_Manager_Project_Documentation_Render.pdf'
$word=New-Object -ComObject Word.Application
$word.Visible=$false
$word.DisplayAlerts=0
$doc=$null
try {
  Write-Output 'OPENING'
  $doc=$word.Documents.Open($html,$false,$true)
  Write-Output 'OPENED'
  $section=$doc.Sections.Item(1)
  $section.PageSetup.PaperSize=2
  $section.PageSetup.TopMargin=$word.InchesToPoints(0.68)
  $section.PageSetup.BottomMargin=$word.InchesToPoints(0.65)
  $section.PageSetup.LeftMargin=$word.InchesToPoints(0.72)
  $section.PageSetup.RightMargin=$word.InchesToPoints(0.72)
  $header=$section.Headers.Item(1).Range
  $header.Text='DUTY MANAGER  |  PROJECT DOCUMENTATION & HANDOVER'
  $header.Font.Name='Aptos';$header.Font.Size=8;$header.Font.Bold=-1;$header.Font.Color=5723991
  $header.ParagraphFormat.Alignment=2
  $footer=$section.Footers.Item(1)
  $footer.Range.Text='Confidential - Internal Project Handover     '
  $footer.Range.Font.Name='Aptos';$footer.Range.Font.Size=8;$footer.Range.Font.Color=6908265
  $footer.Range.ParagraphFormat.Alignment=1
  $footer.PageNumbers.Add(0,$true)|Out-Null
  Write-Output 'SAVING'
  $doc.SaveAs2($docx,12)
  Write-Output 'SAVED'
  $pages=$doc.ComputeStatistics(2)
  $doc.ExportAsFixedFormat($pdf,17)
  Write-Output "DOCX=$docx"
  Write-Output "PDF=$pdf"
  Write-Output "PAGES=$pages"
} finally {
  if($doc){$doc.Close($false)}
  $word.Quit()
  if($doc){[void][Runtime.InteropServices.Marshal]::ReleaseComObject($doc)}
  [void][Runtime.InteropServices.Marshal]::ReleaseComObject($word)
  [gc]::Collect();[gc]::WaitForPendingFinalizers()
}
