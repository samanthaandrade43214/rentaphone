@echo off
echo ====================================================
echo   Preparando Repositorio Git para Cloudflare Pages
echo ====================================================
git init
git add .
git commit -m "Deploy Facilita iPhone + RePix Mobile-First"
git branch -M main
echo.
echo Repositorio Git inicializado com sucesso no branch main!
echo Para conectar ao seu GitHub, execute:
echo   git remote add origin https://github.com/SEU_USUARIO/SEU_REPO.git
echo   git push -u origin main
echo ====================================================
pause
