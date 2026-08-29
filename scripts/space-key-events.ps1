Add-Type @"
using System.Runtime.InteropServices;

public static class AiRespawnKeyState
{
    [DllImport("user32.dll")]
    public static extern short GetAsyncKeyState(int virtualKey);
}
"@

$spaceWasDown = $false
$escapeWasDown = $false

while ($true) {
    $spaceIsDown = (([AiRespawnKeyState]::GetAsyncKeyState(0x20) -band 0x8000) -ne 0)
    $escapeIsDown = (([AiRespawnKeyState]::GetAsyncKeyState(0x1B) -band 0x8000) -ne 0)

    if ($spaceIsDown -ne $spaceWasDown) {
        if ($spaceIsDown) { [Console]::WriteLine("down") } else { [Console]::WriteLine("up") }
        [Console]::Out.Flush()
        $spaceWasDown = $spaceIsDown
    }

    if ($escapeIsDown -and -not $escapeWasDown) {
        [Console]::WriteLine("quit")
        [Console]::Out.Flush()
        break
    }
    $escapeWasDown = $escapeIsDown
    Start-Sleep -Milliseconds 10
}
