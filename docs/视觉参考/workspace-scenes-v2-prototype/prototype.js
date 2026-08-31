const icons = {
  home: '<path d="m3 11 9-8 9 8v9H4Z"/><path d="M9 21v-7h6v7"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  spark: '<path d="m12 3 1.6 4.3L18 9l-4.4 1.7L12 15l-1.6-4.3L6 9l4.4-1.7Z"/><path d="m18.5 14 .8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8Z"/>',
  book: '<path d="M4 5a3 3 0 0 1 3-3h13v17H7a3 3 0 0 0-3 3Z"/><path d="M4 5v17M8 6h8"/>',
  canvas: '<path d="M4 4h16v16H4Z"/><path d="m8 16 3-4 2 2 3-5 2 7"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
  file: '<path d="M6 2h8l4 4v16H6Z"/><path d="M14 2v5h5M9 13h6M9 17h4"/>',
  folder: '<path d="M3 6a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
  layout: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="18" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/>',
  tool: '<path d="M14.7 6.3a4 4 0 0 0-5-5L12 3.6 9.6 6 7.3 3.7a4 4 0 0 0 5 5L4 17l3 3 8.3-8.3a4 4 0 0 0 5-5L18 9l-2.4-2.4 2.3-2.3Z"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19 15a2 2 0 0 0 .4 2l-2.5 2.5a2 2 0 0 0-2-.4 2 2 0 0 0-1.2 1.8h-3.5A2 2 0 0 0 9 19a2 2 0 0 0-2 .4L4.5 17A2 2 0 0 0 5 15a2 2 0 0 0-1.8-1.2v-3.5A2 2 0 0 0 5 9a2 2 0 0 0-.4-2L7 4.5A2 2 0 0 0 9 5a2 2 0 0 0 1.2-1.8h3.5A2 2 0 0 0 15 5a2 2 0 0 0 2-.4L19.5 7A2 2 0 0 0 19 9a2 2 0 0 0 1.8 1.2v3.5A2 2 0 0 0 19 15Z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  chevron: '<path d="m9 18 6-6-6-6"/>',
  flag: '<path d="M5 21V4M5 5h11l-2 4 2 4H5"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  play: '<path d="m8 5 11 7-11 7Z"/>',
  pause: '<path d="M9 5v14M15 5v14"/>',
  tag: '<path d="M20 13 13 20 4 11V4h7Z"/><circle cx="8.5" cy="8.5" r="1"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>',
  refresh: '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6.1 9a7 7 0 0 1 11.6-2.6L20 9M4 15l2.3 2.6A7 7 0 0 0 18 15"/>',
  power: '<path d="M12 2v10M6.3 5.3a8 8 0 1 0 11.4 0"/>',
  monitor: '<rect x="2" y="3" width="20" height="14" rx="3"/><path d="M8 21h8M12 17v4"/>',
  database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v7c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12v7c0 1.7 3.6 3 8 3s8-1.3 8-3v-7"/>',
};

function icon(name) { return `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name] || icons.grid}</svg>`; }
document.querySelectorAll('[data-icon]').forEach((node) => { node.innerHTML = icon(node.dataset.icon); });

const pill = (label, tone = '') => `<span class="status-pill ${tone}">${label}</span>`;
const sceneHeader = (eyebrow, title, description, actions = '') => `<header class="scene-heading"><div><span class="eyebrow">${eyebrow}</span><h1>${title}</h1><p>${description}</p></div><div class="scene-actions">${actions}</div></header>`;

const todoScene = () => `
  ${sceneHeader('TASK WORKSPACE', '待办', '今天、清单与右侧月历保持在同一工作区', `<button class="ghost-button">${icon('search')} 搜索</button><button class="primary-button">${icon('plus')} 新建任务</button>`)}
  <section class="scene-layout todo-layout">
    <aside class="panel sidebar-panel">
      <div class="panel-title"><span>视图</span><button>${icon('more')}</button></div>
      <nav class="side-menu"><button class="active">${icon('home')}<span>今天</span><b>4</b></button><button>${icon('calendar')}<span>明天</span><b>2</b></button><button>${icon('clock')}<span>已计划</span><b>8</b></button><button>${icon('list')}<span>全部</span><b>17</b></button><button>${icon('check')}<span>已完成</span></button></nav>
      <div class="side-section"><header><span>我的清单</span><button>${icon('plus')}</button></header><button><i class="color-dot steel"></i><span>工作</span><b>6</b></button><button><i class="color-dot amber"></i><span>个人项目</span><b>5</b></button><button><i class="color-dot green"></i><span>生活</span><b>3</b></button></div>
      <div class="sidebar-foot"><span class="status-dot green"></span><span>所有更改已保存</span></div>
    </aside>
    <section class="panel task-panel">
      <header class="content-toolbar"><div><span class="eyebrow">TODAY</span><h2>8 月 30 日 · 星期日</h2></div><div class="segmented"><button class="active">列表</button><button>优先级</button><button>时间</button></div></header>
      <div class="quick-entry">${icon('plus')}<input placeholder="快速记录一项待办…"><span>Enter</span></div>
      <div class="task-group"><div class="group-label"><span>上午</span><b>2 项</b></div>
        ${taskRow('整理工作台迭代内容','工作 · 2 个子任务','09:30','high')}
        ${taskRow('确认首页视觉基准','个人项目','11:00','medium')}
      </div>
      <div class="task-group"><div class="group-label"><span>下午</span><b>2 项</b></div>
        ${taskRow('完善桌面盒子入口分组','工作','14:00','')}
        ${taskRow('完成一个专注时段','生活','待安排','')}
      </div>
      <div class="inline-note"><span class="status-dot green"></span><span>今天已完成 3 项</span><b>43%</b></div>
    </section>
    <aside class="panel calendar-panel">
      <header class="content-toolbar"><div><span class="eyebrow">SCHEDULE</span><h2>日历</h2></div><div class="segmented compact"><button class="active">月</button><button>周</button><button>日</button></div></header>
      ${monthCalendar()}
      <div class="schedule-list"><header><span>8 月 30 日</span>${pill('2 项','green')}</header><div><time>10:00</time><i class="event-bar amber"></i><span><b>视觉复核</b><small>30 分钟</small></span></div><div><time>15:30</time><i class="event-bar green"></i><span><b>版本整理</b><small>45 分钟</small></span></div></div>
    </aside>
  </section>`;

function taskRow(title, meta, time, priority) { return `<article class="task-row"><button class="drag-handle">••</button><button class="task-check"></button><div><strong>${title}</strong><small>${priority ? `<i class="priority ${priority}"></i>` : ''}${meta}</small></div><time>${time}</time><button class="row-action">${icon('calendar')}</button><button class="row-action">${icon('more')}</button></article>`; }

function monthCalendar() {
  const cells = [27, 28, 29, 30, 31, ...Array.from({ length: 31 }, (_, i) => i + 1), 1, 2, 3, 4, 5, 6];
  return `<div class="month-calendar"><div class="month-control"><button>‹</button><strong>2026 年 8 月</strong><button>›</button></div><div class="weekdays">${['一','二','三','四','五','六','日'].map(x=>`<span>${x}</span>`).join('')}</div><div class="dates">${cells.map((d, i) => {
    const outside = i < 5 || i > 35;
    const className = [outside ? 'outside' : '', !outside && d === 30 ? 'selected' : '', !outside && d === 28 ? 'has-event' : ''].filter(Boolean).join(' ');
    return `<button class="${className}">${d}</button>`;
  }).join('')}</div></div>`;
}

const timelogScene = () => `
  ${sceneHeader('TIME BLOCKS', '时间块', '把任务、日程和实际投入放到同一条时间轴', `<div class="date-switch"><button>‹</button><strong>8 月 30 日 · 今天</strong><button>›</button></div><button class="primary-button">${icon('plus')} 新建时间块</button>`)}
  <section class="scene-layout timelog-layout">
    <aside class="panel day-summary">
      <div class="panel-title"><span>今日投入</span>${pill('进行中','green')}</div>
      <div class="focus-total"><strong>4h 20m</strong><span>计划 6h · 完成 72%</span></div>
      <div class="donut"><div><strong>72%</strong><span>已投入</span></div></div>
      <div class="legend"><span><i class="color-dot steel"></i>工作 <b>2h 35m</b></span><span><i class="color-dot amber"></i>个人项目 <b>1h 10m</b></span><span><i class="color-dot green"></i>生活 <b>35m</b></span></div>
      <div class="current-focus"><span class="pulse-dot"></span><div><small>当前时间块</small><strong>Home Canvas V2</strong></div><time>00:38:12</time></div>
    </aside>
    <section class="panel timeline-panel">
      <header class="content-toolbar"><div><span class="eyebrow">DAY VIEW</span><h2>今日时间轴</h2></div><div class="segmented"><button class="active">日</button><button>周</button></div></header>
      <div class="timeline-board"><div class="hours">${['08','09','10','11','12','13','14','15','16','17','18','19'].map(h=>`<span>${h}:00</span>`).join('')}</div><div class="time-grid">${Array.from({length:12},()=>'<i></i>').join('')}<div class="time-block work" style="top:2%;height:14%"><b>规划今日任务</b><span>08:10–09:20 · 工作</span></div><div class="time-block project" style="top:20%;height:22%"><b>Home Canvas V2</b><span>10:00–12:00 · 个人项目</span><small>${icon('check')}关联 2 个任务</small></div><div class="time-block life" style="top:51%;height:10%"><b>午间阅读</b><span>14:05–14:45 · 生活</span></div><div class="time-block active" style="top:68%;height:18%"><b>界面细节调整</b><span>15:30–17:00 · 进行中</span></div><div class="now-line" style="top:73%"><span>15:42</span></div></div></div>
    </section>
    <aside class="panel insight-panel">
      <header class="content-toolbar"><div><span class="eyebrow">INSIGHT</span><h2>投入分析</h2></div><button class="icon-button">${icon('more')}</button></header>
      <div class="metric-grid"><div><span>专注时间</span><strong>3h 45m</strong><small class="positive">+35m</small></div><div><span>完成时间块</span><strong>5</strong><small>共 7 个</small></div></div>
      <div class="mini-chart"><div class="chart-header"><span>近 7 天</span><b>26h 40m</b></div><div class="bars">${[48,68,54,82,74,38,66].map((n,i)=>`<span style="height:${n}%"><i>${['一','二','三','四','五','六','日'][i]}</i></span>`).join('')}</div></div>
      <div class="linked-tasks"><header><span>待安排任务</span><b>3</b></header><button>${icon('flag')}<span><strong>修订工作台说明</strong><small>高优先级</small></span>${icon('chevron')}</button><button>${icon('check')}<span><strong>整理工具配置</strong><small>工作</small></span>${icon('chevron')}</button><button>${icon('book')}<span><strong>记录本周阅读</strong><small>生活</small></span>${icon('chevron')}</button></div>
    </aside>
  </section>`;

const habitsScene = () => `
  ${sceneHeader('HABIT SYSTEM', '习惯', '今日打卡、连续记录与近期趋势集中呈现', `<button class="ghost-button">${icon('calendar')} 选择日期</button><button class="primary-button">${icon('plus')} 新建习惯</button>`)}
  <section class="habit-metrics"><article class="panel metric-card"><span>今日完成</span><strong>4 <small>/ 6</small></strong><i class="metric-line green" style="width:67%"></i></article><article class="panel metric-card"><span>最长连续</span><strong>28 <small>天</small></strong><i class="metric-line amber" style="width:82%"></i></article><article class="panel metric-card"><span>本周完成率</span><strong>76<small>%</small></strong><i class="metric-line steel" style="width:76%"></i></article><article class="panel metric-card"><span>本月打卡</span><strong>92 <small>次</small></strong><i class="metric-line green" style="width:88%"></i></article></section>
  <section class="scene-layout habit-layout">
    <section class="panel habit-list-panel"><header class="content-toolbar"><div><span class="eyebrow">TODAY</span><h2>今日习惯</h2></div><div class="segmented"><button class="active">全部</button><button>未完成</button><button>已完成</button></div></header><div class="habit-list">
      ${habitRow('晨间阅读','每天 · 20 分钟','28 天',true,'book','amber')}${habitRow('喝水 8 杯','每天 · 8 次','12 天',true,'spark','steel')}${habitRow('专注工作','工作日 · 2 个时段','9 天',true,'clock','green')}${habitRow('英语学习','周一至周六 · 30 分钟','6 天',false,'book','steel')}${habitRow('力量训练','每周 3 次','2 天',false,'spark','amber')}${habitRow('睡前复盘','每天 · 晚间','15 天',false,'check','green')}
    </div></section>
    <aside class="panel habit-insights"><header class="content-toolbar"><div><span class="eyebrow">TREND</span><h2>近期趋势</h2></div><select><option>近 30 天</option></select></header><div class="completion-ring"><div><strong>81%</strong><span>综合完成率</span></div></div><div class="heatmap"><header><span>打卡热力</span><small>过去 8 周</small></header><div>${Array.from({length:56},(_,i)=>`<i class="l${[0,1,2,3,4,2,1,3][i%8]}"></i>`).join('')}</div></div><div class="streak-list"><header><span>连续记录</span></header><div><span class="habit-symbol amber">${icon('book')}</span><span><strong>晨间阅读</strong><small>当前连续 28 天</small></span><b>28</b></div><div><span class="habit-symbol green">${icon('check')}</span><span><strong>睡前复盘</strong><small>当前连续 15 天</small></span><b>15</b></div><div><span class="habit-symbol steel">${icon('clock')}</span><span><strong>专注工作</strong><small>当前连续 9 天</small></span><b>9</b></div></div></aside>
  </section>`;

function habitRow(name, cadence, streak, done, iconName, tone) { return `<article class="habit-row ${done?'done':''}"><button class="habit-check">${done?icon('check'):''}</button><span class="habit-symbol ${tone}">${icon(iconName)}</span><div><strong>${name}</strong><small>${cadence}</small></div><span class="streak">${icon('spark')} ${streak}</span><button class="row-action">${icon('more')}</button></article>`; }

const memoriesScene = () => `
  ${sceneHeader('MEMORY JOURNAL', '记录册', '保存读完与看完之后值得记住的感受', `<div class="search-field">${icon('search')}<input placeholder="搜索作品、作者或标签"></div><button class="primary-button">${icon('plus')} 记录完成</button>`)}
  <section class="scene-layout memories-layout">
    <aside class="panel memory-filter"><div class="panel-title"><span>浏览</span></div><nav class="side-menu"><button class="active">${icon('grid')}<span>全部记录</span><b>24</b></button><button>${icon('book')}<span>书籍</span><b>12</b></button><button>${icon('play')}<span>电影</span><b>8</b></button><button>${icon('monitor')}<span>剧集</span><b>4</b></button></nav><div class="side-section tags"><header><span>常用标签</span></header><button><i class="color-dot amber"></i><span>值得重读</span><b>6</b></button><button><i class="color-dot steel"></i><span>灵感</span><b>8</b></button><button><i class="color-dot green"></i><span>年度推荐</span><b>4</b></button></div><div class="memory-stat"><span>今年已记录</span><strong>18</strong><small>比去年同期多 5 条</small></div></aside>
    <section class="panel memory-gallery"><header class="content-toolbar"><div><span class="eyebrow">COLLECTION</span><h2>最近完成</h2></div><div class="segmented"><button class="active">封面墙</button><button>列表</button></div></header><div class="cover-grid">${cover('饮食男女','电影','5.0','food','selected')}${cover('百年孤独','书籍','4.8','booka','')}${cover('宇宙探索编辑部','电影','4.6','space','')}${cover('漫长的季节','剧集','4.9','season','')}${cover('悉达多','书籍','4.7','bookb','')}${cover('坠落的审判','电影','4.5','court','')}</div></section>
    <aside class="panel memory-detail"><div class="detail-cover food"><span>饮食男女</span><small>EAT DRINK MAN WOMAN</small></div><div class="detail-title"><span>${pill('电影','amber')}</span><h2>饮食男女</h2><p>李安 · 1994</p></div><div class="rating"><span>★★★★★</span><strong>5.0</strong></div><dl><div><dt>完成日期</dt><dd>2026 年 8 月 29 日</dd></div><div><dt>记录类型</dt><dd>首次观看</dd></div></dl><div class="review"><span>短评</span><p>一桌菜连接起家庭里的沉默、变化与重新理解。</p></div><div class="detail-actions"><button class="ghost-button">编辑记录</button><button class="icon-button">${icon('more')}</button></div></aside>
  </section>`;

function cover(title, type, score, tone, selected) { return `<button class="cover-card ${selected}"><span class="cover-art ${tone}"><b>${title}</b><small>${type==='书籍'?'A BOOK':'MEMORY'}</small></span><span><strong>${title}</strong><small>${type} · ★ ${score}</small></span></button>`; }

const toolsScene = () => `
  ${sceneHeader('TOOL REGISTRY', '工具中心', '启动、状态与配置集中管理，外部工具仍保持独立', `<button class="ghost-button">${icon('search')} 扫描工作区</button><button class="primary-button">${icon('plus')} 添加工具</button>`)}
  <section class="tool-summary"><article class="panel"><span class="status-dot green"></span><div><strong>2</strong><small>运行中</small></div></article><article class="panel"><span class="status-dot steel"></span><div><strong>3</strong><small>可用入口</small></div></article><article class="panel"><span class="status-dot amber"></span><div><strong>1</strong><small>待配置</small></div></article><div class="search-field panel">${icon('search')}<input placeholder="搜索名称、标签或分类"><button>${icon('refresh')}</button></div></section>
  <section class="scene-layout tools-layout">
    <section class="tool-grid">${toolCard('书签页工具','本地网页收藏与浏览器入口','效率','running','B','steel','http://127.0.0.1:4175')}${toolCard('RedNote 工作台','小红书内容与素材工作区','内容','stopped','R','red','外部应用')}${toolCard('Tooler 工坊','PowerPoint 工具与模板能力','效率','ready','T','amber','项目目录')}${toolCard('Check','本地检查与辅助工具','系统','ready','C','green','外部应用')}${toolCard('无限画布','独立外部灵感画布','创作','unconfigured','∞','steel','需要配置启动方式')}</section>
    <aside class="panel runtime-panel"><header class="content-toolbar"><div><span class="eyebrow">RUNTIME</span><h2>运行状态</h2></div>${pill('实时','green')}</header><div class="runtime-hero"><span class="tool-logo steel">B</span><div><strong>书签页工具</strong><small><i class="status-dot green"></i> 服务运行正常</small></div></div><dl><div><dt>状态</dt><dd class="positive">运行中</dd></div><div><dt>健康检查</dt><dd>身份匹配</dd></div><div><dt>启动策略</dt><dd>随工作台启动</dd></div><div><dt>地址</dt><dd>127.0.0.1:4175</dd></div></dl><div class="runtime-actions"><button class="primary-button">打开工具</button><button class="ghost-button">重新启动</button><button class="ghost-button">停止</button></div><div class="runtime-note"><span class="status-dot green"></span><span>最近检查 15:24，服务 ID 正确</span></div></aside>
  </section>`;

function toolCard(name, desc, category, status, letter, tone, endpoint) { const labels={running:['运行中','green'],stopped:['未启动',''],ready:['可用','steel'],unconfigured:['未配置','amber']}; const [label,stateTone]=labels[status]; return `<article class="panel tool-card"><header><span class="tool-logo ${tone}">${letter}</span>${pill(label,stateTone)}<button class="icon-button">${icon('more')}</button></header><h2>${name}</h2><p>${desc}</p><div class="tool-meta"><span>${category}</span><code>${endpoint}</code></div><footer><button class="${status==='unconfigured'?'ghost-button':'primary-button'}">${status==='unconfigured'?'配置':'打开'}</button><button class="icon-button">${icon('folder')}</button><button class="icon-button">${icon('settings')}</button></footer></article>`; }

const settingsScene = () => `
  ${sceneHeader('WORKBENCH SETTINGS', '设置', '外观、首页、显示器、数据与工具行为', `<span class="save-state"><i class="status-dot green"></i>设置已保存</span>`)}
  <section class="scene-layout settings-layout">
    <aside class="panel settings-nav"><div class="settings-profile"><span class="brand-mark">锤</span><div><strong>大锤的工作台</strong><small>本地个人工作中枢</small></div></div><nav class="side-menu"><button class="active">${icon('settings')}<span>通用</span></button><button>${icon('home')}<span>首页与布局</span></button><button>${icon('monitor')}<span>显示器</span></button><button>${icon('tool')}<span>工具与扫描</span></button><button>${icon('database')}<span>数据与备份</span></button><button>${icon('bell')}<span>通知</span></button></nav><div class="version-card"><span>当前版本</span><strong>0.4.0</strong><small>正式版本号始终显示在界面</small></div></aside>
    <section class="panel settings-content"><header class="content-toolbar"><div><span class="eyebrow">GENERAL</span><h2>通用设置</h2><p>控制工作台的启动方式、外观和基础行为</p></div></header>${settingSection('启动与窗口',`${settingRow('启动后显示首页','打开工作台时进入上次使用的内部场景',switcher(true))}${settingRow('关闭时最小化到托盘','保持计时与提醒服务继续运行',switcher(true))}${settingRow('目标显示器','使用显示器工作区，不遮挡 Windows 任务栏',selectField('主屏幕 · 1920×1080'))}`)}${settingSection('首页与天气',`${settingRow('天气城市','用于首页天气卡片和顶部摘要',inputField('上海市 徐汇区','保存'))}${settingRow('桌面盒子自动同步','仅同步名称、路径、系统图标和存在状态',switcher(false))}${settingRow('默认布局','不覆盖用户已经自定义的组件布局',selectField('智能填充'))}`)}${settingSection('界面',`${settingRow('字体大小','兼顾 100% / 125% / 150% 缩放',segmentedField(['小','标准','大'],1))}${settingRow('减少动态效果','关闭非必要位移和过渡动画',switcher(false))}`)}</section>
    <aside class="panel settings-info"><header><span class="eyebrow">DATA BOUNDARY</span><h2>数据边界</h2></header><div class="boundary-item">${icon('database')}<div><strong>日程与待办</strong><span>Electron userData · schedule</span></div><i class="status-dot green"></i></div><div class="boundary-item">${icon('book')}<div><strong>记录册</strong><span>Electron userData · memories</span></div><i class="status-dot green"></i></div><div class="boundary-item">${icon('grid')}<div><strong>工具 Registry</strong><span>本地配置，不上传</span></div><i class="status-dot green"></i></div><div class="info-note"><strong>隐私优先</strong><p>工作台不读取文件内容来生成桌面盒子，只保存必要的入口元信息。</p></div><button class="ghost-button wide">打开数据目录</button></aside>
  </section>`;

function settingSection(title, rows) { return `<section class="setting-section"><h3>${title}</h3>${rows}</section>`; }
function settingRow(title, desc, control) { return `<div class="setting-row"><div><strong>${title}</strong><small>${desc}</small></div>${control}</div>`; }
function switcher(on) { return `<i class="switch ${on?'on':''}"></i>`; }
function selectField(value) { return `<button class="field-control">${value} <span>⌄</span></button>`; }
function inputField(value, action) { return `<div class="inline-field"><input value="${value}"><button>${action}</button></div>`; }
function segmentedField(items, active) { return `<div class="segmented">${items.map((x,i)=>`<button class="${i===active?'active':''}">${x}</button>`).join('')}</div>`; }

const scenes = { todo: todoScene, timelog: timelogScene, habits: habitsScene, memories: memoriesScene, tools: toolsScene, settings: settingsScene };
const query = new URLSearchParams(location.search);
let currentScene = scenes[query.get('scene')] ? query.get('scene') : 'todo';

function renderScene(scene) {
  currentScene = scenes[scene] ? scene : 'todo';
  document.getElementById('scene-root').innerHTML = scenes[currentScene]();
  document.body.dataset.scene = currentScene;
  document.querySelectorAll('[data-scene]').forEach(button => button.classList.toggle('active', button.dataset.scene === currentScene));
  document.querySelectorAll('#scene-root svg').forEach(svg => svg.setAttribute('aria-hidden','true'));
  query.set('scene', currentScene);
  history.replaceState({}, '', `${location.pathname}?${query}`);
}

document.querySelectorAll('[data-scene]').forEach(button => {
  if (!button.disabled) button.addEventListener('click', () => renderScene(button.dataset.scene));
});
renderScene(currentScene);
