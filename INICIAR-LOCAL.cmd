@echo off
cd /d "%~dp0"
echo La Remontada: http://localhost:8092/?view=admin
echo Deixe esta janela aberta enquanto usa o app.
"C:\php\php.exe" -S 127.0.0.1:8092 router.php
pause
