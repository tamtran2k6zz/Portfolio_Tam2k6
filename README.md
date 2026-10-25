# Portfolio Trần Đặng Công Tâm — Đề 13

DTC245220005 · ATTT K23A · Giảng viên Nguyễn Anh Chuyên.
Express/EJS + MySQL, giữ giao diện cá nhân có sẵn. Windows + Docker Desktop Linux containers.

## Khởi động
1. Docker Desktop phải chạy, kiểm tra `docker version` và `docker compose version`.
2. Copy `.env.example` thành `.env`, điền mật khẩu mạnh. Mật khẩu DB dùng ít nhất 32 ký tự hex (0-9, a-f). Không ghi đè `.env` đã có.
3. Chạy `docker compose config --quiet`, rồi `docker compose up -d --build`.
4. Xem `docker compose ps` và `docker compose logs --tail 40 app`.

Website: http://localhost:8080; admin: /login. User theo ADMIN_USERNAME, mật khẩu khởi tạo trong ADMIN_INITIAL_PASSWORD. phpMyAdmin http://localhost:8081, user portfolio_app và APP_DB_PASSWORD. MySQL không publish cổng host.

## Dữ liệu và bảo mật
Dữ liệu ban đầu: 5 dự án và 8 kỹ năng. Schema/init chỉ chạy khi mysql_data còn mới. Không dùng `down -v` để áp dụng cấu hình. Đổi mật khẩu trong .env không tự thay mật khẩu bên trong DB đã có dữ liệu.
App và Nginx non-root, read-only, drop capabilities; DB ở internal network, tài khoản app chỉ CRUD trên portfolio.*. phpMyAdmin dùng Apache root để khởi tạo, đây là ngoại lệ; công cụ quản trị chỉ bind localhost. init-logs là job root một lần, không có mạng, chỉ chuẩn bị quyền hai volume log.
HTTP có security headers theo đề; cookie HttpOnly/SameSite=Lax, không Secure vì demo HTTP. Chưa phải cấu hình Internet production.

## Git và đầu ra local
Repository chỉ chứa source, tests, cấu hình và tài liệu kỹ thuật. Báo cáo, ảnh minh chứng, backup và secrets lưu ngoài Git. Không commit `.env` hoặc output kiểm thử. Tài nguyên ảnh được website sử dụng trong app/public vẫn là source asset.

Docker Compose: https://docs.docker.com/compose/intro/compose-application-model/
