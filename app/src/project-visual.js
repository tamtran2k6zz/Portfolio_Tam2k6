const screenshots = {
  'portfolio_tam2k6': 'portfolio-home.webp',
  'website_portfolio_de13': 'portfolio-home.webp',
  'my_web_server': 'eduquiz.webp',
  'project_smart_bus_ticketing_system_ictu': 'smartbus.webp',
  'he_thong_quan_ly_phong_kham': 'clinic.webp'
};

export function projectVisual(project) {
  let repository = '';
  try {
    const url = new URL(project.link);
    if (url.hostname === 'github.com' && url.pathname.toLowerCase().startsWith('/tamtran2k6zz/')) {
      repository = url.pathname.split('/')[2].replace(/\.git$/i, '').toLowerCase();
    }
  } catch { /* Projects may have no external link. */ }
  if (screenshots[repository]) return {image: screenshots[repository], caption: 'Giao diện dự án', real: true};
  if (repository === '_web_zshop') return {image: null, caption: 'ZShop · Thương mại điện tử', real: true};
  const subject = (project.title + ' ' + project.stack).toLowerCase();
  const type = /log|loki/.test(subject) ? 'logging' : /dashboard|grafana|prometheus/.test(subject) ? 'monitoring' : /backup|mysql|database/.test(subject) && !/portfolio|đề 13/.test(subject) ? 'database' : 'portfolio';
  return {image: type + '.png', caption: 'Minh họa từ hệ thống Portfolio', real: false};
}
