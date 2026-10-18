@echo off
chcp 65001 >nul
title 尸潮幸存者 - 手机畅玩服务
cd /d "%~dp0"

where python >nul 2>nul
if errorlevel 1 (
  echo.
  echo   [!] 没找到 Python。请改用其它静态服务器，或直接把本文件夹拷进手机打开 index.html。
  echo.
  pause
  exit /b 1
)

set "LAN="
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
  if not defined LAN set "LAN=%%a"
)
if defined LAN set "LAN=%LAN: =%"

echo.
echo   ============================================
echo    尸潮幸存者 · 手机畅玩服务已启动
echo   ============================================
echo.
echo   1) 手机与电脑连同一个 Wi-Fi
echo   2) 手机浏览器打开下面这个地址：
echo.
if defined LAN (
  echo        http://%LAN%:8080/
) else (
  echo        http://^<电脑的局域网IP^>:8080/
)
echo.
echo   电脑本机预览：  http://localhost:8080/
echo   存档保存在各自浏览器里，互不影响
echo.
echo   关掉本窗口（或按 Ctrl+C）即停止服务。
echo.
python -m http.server 8080 --bind 0.0.0.0
pause
