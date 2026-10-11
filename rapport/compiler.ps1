param(
  [string]$ToolsDir = (Join-Path $env:LOCALAPPDATA 'qa-report-tools'),
  [switch]$Clean,
  [switch]$MakeReferenceDoc
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$out = Join-Path $root 'out'

$pandoc = Get-ChildItem $ToolsDir -Recurse -Filter 'pandoc.exe' -ErrorAction SilentlyContinue | Where-Object { $_.FullName -match '\\pandoc\\' } | Select-Object -First 1
if (-not $pandoc) { throw "pandoc introuvable. Developpez l'archive pandoc dans $ToolsDir\pandoc\ puis relancez (ou passez -ToolsDir)." }
$pandoc = $pandoc.FullName
$plantuml = Get-ChildItem $ToolsDir -Filter 'plantuml-*.jar' | Where-Object { $_.Name -notmatch 'javadoc|sources' } | Select-Object -First 1
if (-not $plantuml) { throw 'plantuml-*.jar introuvable dans le dossier des outils.' }

$files = @(
  '01-liminaires.md',
  '02-chapitre-1-introduction.md',
  '03-chapitre-2-besoins.md',
  '04-chapitre-3-architecture.md',
  '05-chapitre-4-realisation.md',
  '06-chapitre-5-tests-resultats.md',
  '07-conclusion-perspectives.md',
  '08-bibliographie-annexes.md'
)

if ($Clean -and (Test-Path $out)) { Remove-Item $out -Recurse -Force }
New-Item -ItemType Directory -Force -Path "$out\figures" | Out-Null

$luaFilter = Join-Path $out 'pagebreak.lua'
[System.IO.File]::WriteAllText($luaFilter, @'
function Para(el)
  if #el.content == 1
    and el.content[1].t == 'Str'
    and el.content[1].text == 'PAGEBREAK' then
    return pandoc.RawBlock('openxml',
      '<w:p><w:r><w:br w:type="page"/></w:r></w:p>')
  end
end
'@, (New-Object System.Text.UTF8Encoding($false)))

Write-Host '[1/4] Rendu des diagrammes PlantUML...'
& java -jar $plantuml.FullName -tpng -o "$out\figures" (Get-ChildItem "$root\diagrammes" -Filter '*.puml' | ForEach-Object { $_.FullName }) 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Le rendu PlantUML a echoue.' }
Write-Host '      diagrammes rendus dans out/figures.'

function Get-FigureImage([string]$number) {
  $key = $number -replace '\.', '-'
  $hit = Get-ChildItem "$out\figures" -Filter "fig-$key-*.png" -ErrorAction SilentlyContinue | Select-Object -First 1
  return $hit
}

Write-Host '[2/4] Assemblage du document markdown...'
$combined = New-Object System.Collections.Generic.List[string]
for ($i = 0; $i -lt $files.Count; $i++) {
  $path = Join-Path $root $files[$i]
  $lines = Get-Content -LiteralPath $path -Encoding UTF8
  $inFence = $false
  foreach ($line in $lines) {
    if ($line -match '^```') { $inFence = -not $inFence }
    if (-not $inFence -and $line -match '^\s*---\s*$') { continue }
    $m = [regex]::Match($line, '^>\s*\*\*(Figure\s+(\d+\.\d+))\s*:\s*(.+?)\s*\*\*\s*$')
    if ($m.Success) {
      $img = Get-FigureImage $m.Groups[2].Value
      if ($img) {
        $combined.Add("![$($m.Groups[1].Value)]($('figures/' + $img.Name))")
        $combined.Add('')
      }
    }
    $combined.Add($line)
  }
  if ($i -lt $files.Count - 1) {
    $combined.Add('')
    $combined.Add('PAGEBREAK')
    $combined.Add('')
  }
}

$combinedPath = Join-Path $out 'rapport-complet.md'
[System.IO.File]::WriteAllLines($combinedPath, $combined, (New-Object System.Text.UTF8Encoding($false)))

if ($MakeReferenceDoc) {
  Write-Host '[3/4] Generation du document de style de reference...'
  $refDir = Join-Path $out 'style'
  New-Item -ItemType Directory -Force -Path $refDir | Out-Null
  $ref = Join-Path $refDir 'reference.docx'
  cmd /c "`"$pandoc`" --print-default-data-file reference.docx > `"$ref`""
}

Write-Host '[4/4] Conversion vers Word...'
$docx = Join-Path $out 'Rapport_QA_Testing_Agent.docx'
& $pandoc $combinedPath `
  --from 'markdown+smart' `
  --to docx `
  --output $docx `
  --resource-path $out `
  --lua-filter $luaFilter `
  --metadata lang=fr-FR `
  $(if ($MakeReferenceDoc) { , '--reference-doc', (Join-Path $out 'style\reference.docx') })

Write-Host "Termine : $docx ($([math]::Round((Get-Item $docx).Length / 1KB)) Ko)"