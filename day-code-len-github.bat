@echo off
REM ============================================
REM  Day code website KSNB Long Chau len GitHub
REM  Cach dung: bo file nay vao TRONG thu muc
REM  ksnb-frontend (da giai nen) roi bam dup 2 lan
REM ============================================

cd /d "%~dp0"

echo Dang khoi tao git...
git init
git add .
git commit -m "Khoi tao website KSNB Long Chau"
git branch -M main
git remote add origin https://github.com/minhthientran24-droid/ksnb-frontend.git

echo.
echo Dang day code len GitHub...
echo Neu GitHub hoi dang nhap, hay dang nhap bang tai khoan cua anh.
echo.
git push -u origin main

echo.
echo ================================
echo   XONG! Kiem tra lai tren GitHub.
echo ================================
pause
