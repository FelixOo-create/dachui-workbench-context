Option Explicit

Dim shell, fso, projectDir, http, healthOk, command

Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
projectDir = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
healthOk = False

On Error Resume Next
Set http = CreateObject("WinHttp.WinHttpRequest.5.1")
http.SetTimeouts 1000, 1000, 1000, 1000
http.Open "GET", "http://localhost:4173/api/health", False
http.Send
If Err.Number = 0 And http.Status >= 200 And http.Status < 300 Then
  healthOk = True
End If
Err.Clear
On Error GoTo 0

If Not healthOk Then
  command = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & projectDir & "\scripts\start-bookmarks-launcher.ps1"""
  shell.CurrentDirectory = projectDir
  shell.Run command, 0, False
End If
