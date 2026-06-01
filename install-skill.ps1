$ErrorActionPreference = 'Stop'

$Repo = 'https://github.com/aisparkedu/imgen.git'
$InstallDir = Join-Path $HOME '.local\share\imgen'

# 通过 `irm ... | iex` 执行时拿不到脚本路径（$PSScriptRoot 为空），
# 克隆到固定位置后从那里继续，避免二次加载磁盘脚本受 ExecutionPolicy 限制。
$ProjectDir = $PSScriptRoot
if (-not $ProjectDir -or -not (Test-Path (Join-Path $ProjectDir 'package.json'))) {
    Write-Host '==> Cloning imgen...'
    if (Test-Path $InstallDir) { Remove-Item -Recurse -Force $InstallDir }
    git clone --depth 1 $Repo $InstallDir
    $ProjectDir = $InstallDir
}

Push-Location $ProjectDir
try {
    Write-Host '==> Installing dependencies...'
    npm install
    if ($LASTEXITCODE -ne 0) { throw 'npm install failed' }

    Write-Host '==> Linking imgen CLI globally...'
    npm link
    if ($LASTEXITCODE -ne 0) { throw 'npm link failed' }

    function Install-Skill([string]$SkillDir) {
        if (Test-Path $SkillDir) {
            $item = Get-Item $SkillDir -Force
            if ($item.LinkType) {
                # 已是链接/junction，只删链接本身（.Delete() 不会递归删 target）
                $item.Delete()
            } else {
                Write-Host "Warning: $SkillDir exists and is not a link, skipping."
                return
            }
        }
        New-Item -ItemType Directory -Force -Path (Split-Path $SkillDir -Parent) | Out-Null
        # 用 junction 而非 symlink：指向本地目录、无需管理员权限
        New-Item -ItemType Junction -Path $SkillDir -Target $ProjectDir | Out-Null
        Write-Host "  $SkillDir -> $ProjectDir"
    }

    Write-Host '==> Installing skills...'
    Install-Skill (Join-Path $HOME '.claude\skills\imgen')
    Install-Skill (Join-Path $HOME '.codex\skills\imgen')
    Install-Skill (Join-Path $HOME '.gemini\skills\imgen')

    Write-Host ''
    $imgen = (Get-Command imgen -ErrorAction SilentlyContinue).Source
    if ($imgen) {
        Write-Host "Done. imgen CLI: $imgen"
    } else {
        Write-Host 'Done. imgen CLI linked (open a new terminal if `imgen` is not found).'
    }
    Write-Host 'Restart Claude Code / Codex / Gemini CLI to activate the skill.'
} finally {
    Pop-Location
}
