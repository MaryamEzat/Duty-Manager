$ErrorActionPreference = 'Stop'
$sourcePath = Join-Path $PWD 'Duty_Manager_Project_Documentation.md'
$outputPath = Join-Path $PWD 'Duty_Manager_Project_Documentation.docx'
$pdfPath = Join-Path $PWD 'Duty_Manager_Project_Documentation_Render.pdf'

$wdStory = 6
$wdPageBreak = 7
$wdAlignLeft = 0
$wdAlignCenter = 1
$wdAlignRight = 2
$wdCollapseEnd = 0
$wdFormatXMLDocument = 12
$wdExportFormatPDF = 17
$wdLineSpaceSingle = 0
$wdListBullet = 2
$wdListNumber = 3
$wdPageNumberStyleArabic = 0
$wdActiveEndPageNumber = 3
$wdStatisticPages = 2

function Clean-Text([string]$s) {
    $s = $s -replace '\*\*', ''
    $s = $s -replace '`', ''
    $s = $s -replace '^\s*- \[ \]\s*', ''
    return $s.Trim()
}

function Set-Cell-Shading($cell, [int]$color) {
    $cell.Shading.BackgroundPatternColor = $color
}

function Add-Paragraph($selection, [string]$text, [string]$style = 'Normal', [int]$align = 0, [bool]$bold = $false) {
    $selection.Style = $style
    $selection.ParagraphFormat.Alignment = $align
    $selection.Font.Bold = [int]$bold
    $selection.TypeText((Clean-Text $text))
    $selection.TypeParagraph()
    $selection.Font.Bold = 0
}

$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
$doc = $word.Documents.Add()
$sel = $word.Selection

try {
    $section = $doc.Sections.Item(1)
    $section.PageSetup.PaperSize = 2
    $section.PageSetup.TopMargin = $word.InchesToPoints(0.68)
    $section.PageSetup.BottomMargin = $word.InchesToPoints(0.65)
    $section.PageSetup.LeftMargin = $word.InchesToPoints(0.72)
    $section.PageSetup.RightMargin = $word.InchesToPoints(0.72)
    $section.PageSetup.HeaderDistance = $word.InchesToPoints(0.3)
    $section.PageSetup.FooterDistance = $word.InchesToPoints(0.3)

    $normal = $doc.Styles.Item('Normal')
    $normal.Font.Name = 'Aptos'
    $normal.Font.Size = 9.5
    $normal.Font.Color = 0
    $normal.ParagraphFormat.SpaceAfter = 5
    $normal.ParagraphFormat.LineSpacingRule = $wdLineSpaceSingle

    foreach ($name in @('Title','Subtitle','Heading 1','Heading 2','Heading 3')) {
        $style = $doc.Styles.Item($name)
        $style.Font.Name = 'Aptos Display'
        $style.Font.Color = 0
    }
    $doc.Styles.Item('Title').Font.Size = 30
    $doc.Styles.Item('Title').Font.Bold = -1
    $doc.Styles.Item('Subtitle').Font.Size = 15
    $doc.Styles.Item('Subtitle').Font.Color = 5723991
    $doc.Styles.Item('Heading 1').Font.Size = 17
    $doc.Styles.Item('Heading 1').Font.Bold = -1
    $doc.Styles.Item('Heading 1').ParagraphFormat.SpaceBefore = 12
    $doc.Styles.Item('Heading 1').ParagraphFormat.SpaceAfter = 6
    $doc.Styles.Item('Heading 1').ParagraphFormat.KeepWithNext = -1
    $doc.Styles.Item('Heading 2').Font.Size = 13
    $doc.Styles.Item('Heading 2').Font.Bold = -1
    $doc.Styles.Item('Heading 2').ParagraphFormat.SpaceBefore = 9
    $doc.Styles.Item('Heading 2').ParagraphFormat.SpaceAfter = 4
    $doc.Styles.Item('Heading 2').ParagraphFormat.KeepWithNext = -1
    $doc.Styles.Item('Heading 3').Font.Size = 11
    $doc.Styles.Item('Heading 3').Font.Bold = -1
    $doc.Styles.Item('Heading 3').ParagraphFormat.SpaceBefore = 7
    $doc.Styles.Item('Heading 3').ParagraphFormat.SpaceAfter = 3
    $doc.Styles.Item('Heading 3').ParagraphFormat.KeepWithNext = -1

    $header = $section.Headers.Item(1).Range
    $header.Text = 'DUTY MANAGER  |  PROJECT DOCUMENTATION & HANDOVER'
    $header.Font.Name = 'Aptos'
    $header.Font.Size = 8
    $header.Font.Bold = -1
    $header.Font.Color = 5723991
    $header.ParagraphFormat.Alignment = $wdAlignRight

    $footer = $section.Footers.Item(1)
    $footer.Range.Text = 'Confidential — Internal Project Handover     '
    $footer.Range.Font.Name = 'Aptos'
    $footer.Range.Font.Size = 8
    $footer.Range.Font.Color = 6908265
    $footer.Range.ParagraphFormat.Alignment = $wdAlignCenter
    $footer.PageNumbers.Add($wdPageNumberStyleArabic, $true) | Out-Null

    $sel.TypeParagraph()
    $sel.TypeParagraph()
    $sel.TypeParagraph()
    Add-Paragraph $sel 'DUTY MANAGER' 'Title' $wdAlignCenter $true
    Add-Paragraph $sel 'Complete Project Documentation' 'Subtitle' $wdAlignCenter $false
    Add-Paragraph $sel 'and Handover Report' 'Subtitle' $wdAlignCenter $false
    $sel.TypeParagraph()
    $sel.TypeParagraph()

    $coverTable = $doc.Tables.Add($sel.Range, 5, 2)
    $coverTable.Borders.Enable = 1
    $coverTable.Borders.InsideColor = 14277081
    $coverTable.Borders.OutsideColor = 14277081
    $coverTable.Range.Font.Name = 'Aptos'
    $coverTable.Range.Font.Size = 10
    $coverData = @(
        @('Document date','13 October 2026'),
        @('Application status','Development completed'),
        @('Primary outstanding item','Final report structure confirmation'),
        @('Source of truth','Current React/TypeScript repository'),
        @('Repository','github.com/MaryamEzat/Duty-Manager')
    )
    for ($r=1; $r -le 5; $r++) {
        $coverTable.Cell($r,1).Range.Text = $coverData[$r-1][0]
        $coverTable.Cell($r,2).Range.Text = $coverData[$r-1][1]
        $coverTable.Cell($r,1).Range.Font.Bold = -1
        Set-Cell-Shading $coverTable.Cell($r,1) 15132390
        if (($r % 2) -eq 0) { Set-Cell-Shading $coverTable.Cell($r,2) 16448250 }
    }
    $coverTable.Columns.Item(1).Width = $word.InchesToPoints(2.0)
    $coverTable.Columns.Item(2).Width = $word.InchesToPoints(4.7)
    $sel.SetRange($coverTable.Range.End, $coverTable.Range.End)
    $sel.TypeParagraph()
    $sel.TypeParagraph()
    Add-Paragraph $sel 'Prepared for project sponsors, operational owners, Power Platform administrators, support teams, and future development teams.' 'Normal' $wdAlignCenter $false
    $sel.InsertBreak($wdPageBreak)

    Add-Paragraph $sel 'Contents' 'Title' $wdAlignLeft $true
    $contents = @(
        '1. Executive Summary','2. Project Overview','3. Business Objectives','4. Current Project Status','5. Functional Scope',
        '6. Solution Architecture','7. Technology Stack','8. GitHub Repository and Source Control','9. Application Structure',
        '10. Application Modules and Screens','11. Dataverse Data Model','12. Data Sources and Integrations',
        '13. Automated KPIs and Calculations','14. Business Logic and Lifecycle Rules','15. Business Unit and Country Logic',
        '16. User Workflows','17. Automation and Scheduled Processes','18. Reporting and Export','19. Security and Access Control',
        '20. Deployment and Environment Configuration','21. Completed Work','22. Current Outstanding Item',
        '23. Dependencies, Risks, and Limitations','24. Recommended Next Steps','25. Management Handover Summary',
        'Appendices A–D'
    )
    $ct = $doc.Tables.Add($sel.Range, 13, 2)
    $ct.Borders.Enable = 0
    $ct.Range.Font.Name = 'Aptos'
    $ct.Range.Font.Size = 9
    for ($i=0; $i -lt $contents.Count; $i++) {
        $row = [math]::Floor($i / 2) + 1
        $col = ($i % 2) + 1
        $ct.Cell($row,$col).Range.Text = $contents[$i]
        $ct.Cell($row,$col).Range.ParagraphFormat.SpaceAfter = 5
    }
    $ct.Columns.Item(1).Width = $word.InchesToPoints(3.35)
    $ct.Columns.Item(2).Width = $word.InchesToPoints(3.35)
    $sel.SetRange($ct.Range.End, $ct.Range.End)
    $sel.InsertBreak($wdPageBreak)

    $lines = Get-Content -LiteralPath $sourcePath
    $start = [Array]::IndexOf($lines, '## Document purpose')
    if ($start -lt 0) { throw 'Document purpose heading not found.' }
    $i = $start
    while ($i -lt $lines.Count) {
        $line = $lines[$i]
        if ($line -eq '## Contents') {
            $i++
            while ($i -lt $lines.Count -and $lines[$i] -ne '---') { $i++ }
            $i++
            continue
        }
        if ($line -eq '---' -or [string]::IsNullOrWhiteSpace($line)) {
            $i++
            continue
        }
        if ($line -match '^\|') {
            $tableLines = New-Object System.Collections.Generic.List[string]
            while ($i -lt $lines.Count -and $lines[$i] -match '^\|') {
                $tableLines.Add($lines[$i])
                $i++
            }
            if ($tableLines.Count -ge 2) {
                $rows = @()
                foreach ($tl in $tableLines) {
                    $parts = $tl.Trim('|').Split('|') | ForEach-Object { (Clean-Text $_) }
                    $isSeparator = $true
                    foreach ($p in $parts) { if ($p -notmatch '^:?-{3,}:?$') { $isSeparator = $false } }
                    if (-not $isSeparator) { $rows += ,$parts }
                }
                if ($rows.Count -gt 0) {
                    $cols = $rows[0].Count
                    $tbl = $doc.Tables.Add($sel.Range, $rows.Count, $cols)
                    $tbl.Borders.Enable = 1
                    $tbl.Borders.InsideColor = 14277081
                    $tbl.Borders.OutsideColor = 14277081
                    $tbl.AllowAutoFit = $true
                    $tbl.Rows.AllowBreakAcrossPages = 0
                    $tbl.Rows.Item(1).HeadingFormat = -1
                    $tbl.Range.Font.Name = 'Aptos'
                    $tbl.Range.Font.Size = 8
                    for ($r=0; $r -lt $rows.Count; $r++) {
                        for ($c=0; $c -lt $cols; $c++) {
                            $value = if ($c -lt $rows[$r].Count) { $rows[$r][$c] } else { '' }
                            $tbl.Cell($r+1,$c+1).Range.Text = $value
                            $tbl.Cell($r+1,$c+1).VerticalAlignment = 1
                            if ($r -eq 0) {
                                Set-Cell-Shading $tbl.Cell($r+1,$c+1) 3028270
                                $tbl.Cell($r+1,$c+1).Range.Font.Color = 16777215
                                $tbl.Cell($r+1,$c+1).Range.Font.Bold = -1
                            } elseif (($r % 2) -eq 0) {
                                Set-Cell-Shading $tbl.Cell($r+1,$c+1) 16448250
                            }
                        }
                    }
                    $sel.SetRange($tbl.Range.End, $tbl.Range.End)
                    $sel.TypeParagraph()
                }
            }
            continue
        }
        if ($line -match '^# Appendix') {
            Add-Paragraph $sel ($line.Substring(2)) 'Heading 1' $wdAlignLeft $true
        } elseif ($line -match '^# ') {
            Add-Paragraph $sel ($line.Substring(2)) 'Heading 1' $wdAlignLeft $true
        } elseif ($line -match '^## ') {
            Add-Paragraph $sel ($line.Substring(3)) 'Heading 1' $wdAlignLeft $true
        } elseif ($line -match '^### ') {
            Add-Paragraph $sel ($line.Substring(4)) 'Heading 2' $wdAlignLeft $true
        } elseif ($line -match '^#### ') {
            Add-Paragraph $sel ($line.Substring(5)) 'Heading 3' $wdAlignLeft $true
        } elseif ($line -match '^\d+\.\s+') {
            Add-Paragraph $sel $line 'Normal' $wdAlignLeft $false
            $sel.Paragraphs.Item($sel.Paragraphs.Count).Range.ListFormat.ApplyListTemplateWithLevel(
                $word.ListGalleries.Item($wdListNumber).ListTemplates.Item(1), $true, 0, 0, 1
            )
        } elseif ($line -match '^- \[ \]\s+') {
            Add-Paragraph $sel ('☐ ' + ($line -replace '^- \[ \]\s*','')) 'Normal' $wdAlignLeft $false
            $sel.ParagraphFormat.LeftIndent = $word.InchesToPoints(0.18)
        } elseif ($line -match '^-\s+') {
            Add-Paragraph $sel ($line -replace '^-\s+','') 'Normal' $wdAlignLeft $false
            $sel.Paragraphs.Item($sel.Paragraphs.Count).Range.ListFormat.ApplyListTemplateWithLevel(
                $word.ListGalleries.Item($wdListBullet).ListTemplates.Item(1), $true, 0, 0, 1
            )
        } else {
            Add-Paragraph $sel $line 'Normal' $wdAlignLeft $false
        }
        $i++
    }

    foreach ($p in $doc.Paragraphs) {
        if ($p.Range.Text -match 'Requires confirmation') {
            $p.Range.Font.Color = 192
        }
    }

    $doc.Fields.Update() | Out-Null
    $doc.SaveAs2($outputPath, $wdFormatXMLDocument)
    $doc.ExportAsFixedFormat($pdfPath, $wdExportFormatPDF)
    $pages = $doc.ComputeStatistics($wdStatisticPages)
    Write-Output "DOCX=$outputPath"
    Write-Output "PDF=$pdfPath"
    Write-Output "PAGES=$pages"
}
finally {
    if ($doc) { $doc.Close($false) }
    if ($word) { $word.Quit() }
    if ($sel) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($sel) }
    if ($doc) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($doc) }
    if ($word) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) }
    [gc]::Collect()
    [gc]::WaitForPendingFinalizers()
}
