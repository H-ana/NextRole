$ErrorActionPreference = 'Stop'
$resumeWord = $null
$resumeDocument = $null
$fitResult = @{ error = 'unavailable' }
try {
    $resumeWord = New-Object -ComObject Word.Application
    $resumeWord.Visible = $false
    $resumeWord.DisplayAlerts = 0
    $resumeWord.AutomationSecurity = 3
    $resumeDocument = $resumeWord.Documents.Open($env:NEXTROLE_EXPORT_INPUT, $false, $false, $false)
    # All content remains in ordinary body paragraphs, in its original order.
    # Recognize layout roles without rewriting any resume text.
    foreach ($styleName in @('Resume Contact', 'Resume Entry', 'Resume Bullet')) {
        try { $null = $resumeDocument.Styles.Item($styleName) }
        catch { $null = $resumeDocument.Styles.Add($styleName, 1) }
        $resumeDocument.Styles.Item($styleName).BaseStyle = $resumeDocument.Styles.Item(-1).NameLocal
    }
    $sectionPattern = '^(profile|career objective|objective|relevant skills|professional summary|summary|experience|work experience|professional experience|employment history|education|skills|technical skills|soft skills|additional skills|projects|certifications|certificates|achievements|publications|languages)\s*:?$'
    $section = ''
    $firstContent = $true
    $entryPending = $false
    foreach ($paragraph in $resumeDocument.Paragraphs) {
        $line = $paragraph.Range.Text.Trim([char]13, [char]7).Trim()
        if (-not $line) { continue }
        if ($firstContent -and $line.Length -lt 100 -and $line -notmatch '@|https?://|\+?\d[\d ()-]{7,}' -and $line -notmatch $sectionPattern) {
            $paragraph.Style = $resumeDocument.Styles.Item(-63)
        } elseif ($line -match $sectionPattern) {
            $section = $line.ToLower().TrimEnd(':')
            $paragraph.Style = $resumeDocument.Styles.Item(-2)
            $entryPending = $true
        } elseif (-not $section -and ($line -match '@|https?://|linkedin\.com|\+?\d[\d ()-]{7,}')) {
            $paragraph.Style = $resumeDocument.Styles.Item('Resume Contact')
        } elseif ($line -match '^[-*\u2022\u2013]\s+') {
            $paragraph.Style = $resumeDocument.Styles.Item('Resume Bullet')
            $entryPending = $false
        } elseif (($section -match 'experience|employment|education|projects') -and $line.Length -le 150 -and ($entryPending -or $line -match '\s{2,}.*\d{4}|\|.*\d{4}' -or ($section -eq 'projects' -and $line -match '\([^)]{2,60}\)\s*$'))) {
            $paragraph.Style = $resumeDocument.Styles.Item('Resume Entry')
            $entryPending = $false
        } else {
            $paragraph.Style = $resumeDocument.Styles.Item(-1)
            $entryPending = $false
        }
        $firstContent = $false
    }
    $profiles = @(
        @{ Size = 11; Margin = 36; Title = 19; After = 2; Section = 7 },
        @{ Size = 10.5; Margin = 32.4; Title = 18; After = 1.5; Section = 5 },
        @{ Size = 10; Margin = 28.8; Title = 17; After = 1; Section = 4 }
    )
    foreach ($profile in $profiles) {
        $resumeDocument.PageSetup.TopMargin = [single]$profile.Margin
        $resumeDocument.PageSetup.BottomMargin = [single]$profile.Margin
        $resumeDocument.PageSetup.LeftMargin = [single]$profile.Margin
        $resumeDocument.PageSetup.RightMargin = [single]$profile.Margin
        $normal = $resumeDocument.Styles.Item(-1)
        $normal.Font.Name = 'Calibri'
        $normal.Font.Scaling = 100
        $normal.Font.Spacing = 0
        $normal.Font.Size = [single]$profile.Size
        $normal.Font.Color = 0
        $normal.ParagraphFormat.SpaceBefore = 0
        $normal.ParagraphFormat.SpaceAfter = [single]$profile.After
        $normal.ParagraphFormat.LineSpacingRule = 0
        $normal.ParagraphFormat.KeepWithNext = 0
        $normal.ParagraphFormat.KeepTogether = -1
        $heading = $resumeDocument.Styles.Item(-2)
        $heading.Font.Name = 'Calibri'
        $heading.Font.Size = [single]($profile.Size + 0.5)
        $heading.Font.Bold = -1
        $heading.Font.AllCaps = -1
        $heading.Font.Color = 0
        $heading.ParagraphFormat.SpaceBefore = [single]$profile.Section
        $heading.ParagraphFormat.SpaceAfter = [single]3
        $heading.ParagraphFormat.KeepWithNext = -1
        $title = $resumeDocument.Styles.Item(-63)
        $title.Font.Size = [single]$profile.Title
        $title.Font.Color = 0
        $title.ParagraphFormat.SpaceAfter = [single]4
        $title.ParagraphFormat.KeepWithNext = -1
        $contact = $resumeDocument.Styles.Item('Resume Contact')
        $contact.Font.Name = 'Calibri'
        $contact.Font.Size = [single][Math]::Max(10, $profile.Size - 0.5)
        $contact.Font.Bold = 0
        $contact.Font.AllCaps = 0
        $contact.ParagraphFormat.SpaceAfter = [single]4
        $contact.ParagraphFormat.KeepWithNext = -1
        $entry = $resumeDocument.Styles.Item('Resume Entry')
        $entry.Font.Name = 'Calibri'
        $entry.Font.Size = [single]$profile.Size
        $entry.Font.Bold = -1
        $entry.Font.AllCaps = 0
        $entry.ParagraphFormat.SpaceBefore = [single]2
        $entry.ParagraphFormat.SpaceAfter = [single]2
        $entry.ParagraphFormat.KeepWithNext = -1
        $bullet = $resumeDocument.Styles.Item('Resume Bullet')
        $bullet.Font.Name = 'Calibri'
        $bullet.Font.Size = [single]$profile.Size
        $bullet.Font.Bold = 0
        $bullet.Font.AllCaps = 0
        $bullet.ParagraphFormat.LeftIndent = [single]10
        $bullet.ParagraphFormat.FirstLineIndent = [single]-10
        $resumeDocument.Repaginate()
        $pageCount = $resumeDocument.ComputeStatistics(2)
        if ($pageCount -eq 1) {
            $resumeDocument.Save()
            if ($env:NEXTROLE_EXPORT_PREVIEW) { $resumeDocument.ExportAsFixedFormat($env:NEXTROLE_EXPORT_PREVIEW, 17) }
            # Word exposes AllCaps heading styling through Range.Text. Read body
            # text with that display effect disabled, then restore the saved layout.
            $heading.Font.AllCaps = 0
            $wordBodyText = [string]$resumeDocument.Content.Text
            $heading.Font.AllCaps = -1
            $fitResult = @{ pages = 1; font_size = $profile.Size; font = $normal.Font.Name; rendered_text = $wordBodyText }
            break
        }
    }
    if ($pageCount -ne 1) { $fitResult = @{ error = 'overflow'; pages = $pageCount } }
} catch {
    $fitResult = @{ error = 'unavailable' }
} finally {
    if ($null -ne $resumeDocument) { try { $resumeDocument.Close(0) } catch {} }
    if ($null -ne $resumeWord) { try { $resumeWord.Quit() } catch {} }
    if ($null -ne $resumeDocument) { [void][System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($resumeDocument) }
    if ($null -ne $resumeWord) { [void][System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($resumeWord) }
    $fitResult | ConvertTo-Json -Compress | Set-Content -LiteralPath $env:NEXTROLE_EXPORT_RESULT -Encoding UTF8
}





