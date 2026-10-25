# Demo Đề 13 trong một file Compose

## Bắt đầu
Mở Docker Desktop ở Linux containers. Mở PowerShell tại thư mục Project.
Lần đầu: `./scripts/setup.ps1` (tạo .env và secrets/exporter.cnf; giữ .env đã có).
Chạy: `docker compose up -d --build`. Xem: `docker compose ps`.
Website http://localhost:8080; phpMyAdmin http://localhost:8081; Grafana http://localhost:3001; Prometheus http://localhost:9090/targets.
Thông tin đăng nhập trong .env, không chiếu mật khẩu khi demo.

## Cấu hình lại
| Yêu cầu | File và chỗ sửa | Lệnh áp dụng | Xác nhận |
|---|---|---|---|
| Đổi cổng web | .env: WEB_PORT | docker compose config --quiet; docker compose up -d nginx | Mở localhost:cổng-mới/health |
| Đổi cổng Grafana | .env: GRAFANA_PORT | docker compose up -d grafana | Mở URL mới |
| Đổi cổng phpMyAdmin | .env: PMA_PORT | docker compose up -d phpmyadmin | Mở URL mới |
| Đổi tên/giới thiệu/dự án | /login → admin | Lưu biểu mẫu | Tải lại trang chủ |
| Sửa headers/proxy | nginx/default.conf | docker compose exec nginx nginx -t; docker compose exec nginx nginx -s reload | Kiểm tra headers/request |
| Đổi chu kỳ scrape | monitoring/prometheus.yml: scrape_interval | docker compose restart prometheus | Xem Targets và thời gian scrape |
| Sửa dashboard | monitoring/grafana/dashboards/portfolio.json | Chờ provisioning cập nhật hoặc docker compose restart grafana | Mở dashboard Portfolio |
| Sửa nguồn log/labels | logging/promtail.yml | docker compose restart promtail | Grafana Explore → Loki |
| Sửa truy vấn LogQL | Grafana Explore, tham khảo logging/queries.logql | Chạy query | Có dòng log thực tế |
| Sửa source Express/EJS/CSS | app/ | docker compose up -d --build app; docker compose exec nginx nginx -s reload | /health và giao diện |
| Xem lỗi | chọn đúng service | docker compose logs --tail 50 app | Đọc event/code lỗi, không in secrets |

`restart` không áp dụng thay đổi port/env: dùng `up -d` để Compose tạo lại container. Khi rebuild app, reload Nginx để tránh IP upstream cũ. Mount cấu hình read-only vào container không ngăn chỉnh file ở Windows.

## LogQL dùng khi demo
```logql
{job="nginx"}
{job="nginx"} | json | status >= 400
{job="app"} | json | event="login_failed"
```
Mở /khong-ton-tai để tạo 404; đăng nhập sai một lần từ form có CSRF để tạo login_failed. Không thử sai liên tục: sau 5 lần sẽ bị giới hạn tạm thời.

## Dữ liệu và mật khẩu
MySQL có 5 bảng, 5 dự án và 8 kỹ năng lúc khởi tạo. Đổi .env không tự đổi password/user/database trong volume cũ. Muốn đổi cần SQL ALTER USER và cập nhật phía app/exporter tương ứng; sao lưu trước, không xóa volume để làm nhanh. Admin đổi mật khẩu tại /admin; sau khi đổi, ADMIN_INITIAL_PASSWORD chỉ còn là giá trị khởi tạo cũ.

## Kiểm tra và backup
Nếu có Python 3: `python scripts/verify.py --output "đường-dẫn-ngoài-repo/verification.json"`.
Backup và thử phục hồi riêng: `python scripts/backup.py --output "đường-dẫn-ngoài-repo/Backup" --verify-restore`.
Database kiểm tra mới có tên portfolio_restore_timestamp, giữ để đối chiếu; không ghi đè DB ứng dụng. File SQL chứa dữ liệu tài khoản đã băm, vẫn phải bảo vệ và không commit.

## Kết thúc
`docker compose stop` để dừng riêng stack này, giữ volumes. Chạy lại `docker compose up -d`.
Không dùng down -v, prune, factory reset hoặc tắt các project khác.

## Phạm vi bảo vệ
Các cổng chỉ bind 127.0.0.1. HTTP có headers, đáp ứng lựa chọn cơ bản của đề; chưa có TLS, cookie không Secure. MySQL internal và không publish port. App/Nginx non-root, read-only, drop ALL. cAdvisor privileged đọc host Linux của Docker Desktop; phpMyAdmin/Promtail và init-logs là ngoại lệ UID root được ghi trong báo cáo. Không mở Internet trực tiếp.
Promtail đã EOL theo tài liệu Grafana, giữ để đúng đề; production cần client được hỗ trợ. Chưa coi đây là bản production đã được quét mọi CVE.
