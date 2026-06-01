Output demo/demo.gif

Set Shell "bash"
Set FontSize 15
Set Width 800
Set Height 400
Set Theme "Dracula"
Set Padding 20
Set TypingSpeed 80ms
Set WaitTimeout 120s

Hide
Type "cd /Users/lawrence/workspace_creator/imgen"
Enter
Sleep 0.5s
Show

Type `imgen "a red fox sitting in snow" -o demo/fox.png`
Sleep 0.5s
Enter
Wait+Screen /fox\.png/
Sleep 2s
