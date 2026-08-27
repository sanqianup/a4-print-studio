# 自由排版 / 2026-08-27

- 目标：保留自动网格，新增独立自由排版，按纸张真实毫米位置、尺寸、角度生成一致 PDF。
- R1 追加：自由模式可拖动整张图片位置、等比例缩放、任意角度旋转，数字精调。
- R2 延续：多选/删除/框选、A4、纯浏览器 PDF 与 IndexedDB 缓存，不上传用户图。
- R3 延续：GitHub main + Pages 发布，完成后本机临时项目移入回收站；不修改原图，不真实打印。
- 范围：新增 free-layout 几何模块、自由图片/控件模块、PDF 自由分支，小范围 App 接入。允许重叠、层级调整与页码选择；切回网格不覆盖自由坐标。
- 非目标：跨页拖放、多选组变换、无限画布、云端存储、撤销系统。
- 验收：拖动/缩放/角度数据更新；页面边界约束；保存恢复；旧缓存兼容；网格不变；PDF 毫米位置与旋转一致；单测+构建+浏览器聚焦测试。
- 阶段：实现、验证、GitHub Pages 发布完成；交付前执行本机临时文件清理。
- 改动文件：src/free-layout.js、src/FreeLayout.jsx、src/free-layout.css、src/free-layout.test.js、src/App.jsx、src/pdf.js、README.md、本状态。
- R1 已验证：鼠标移动、四角缩放（90→109.2mm）、旋转手柄（0→89.8°）、精确输入、页码选择、模式切换保留坐标。使用 document 级 pointer/mouse 跟踪，防止离开小手柄后丢事件。
- R2 已验证：两张图框选、内部拖动不出现上传遮罩；刷新后恢复两张图位置/尺寸/30°及-25°角度；新增图不重排已有自由坐标；旧记录由单测覆盖。删除核心沿用原实现，未在浏览器执行删除或真实打印。
- PDF 已验证：实际下载双图重叠 A4 PDF，Poppler 确认 1 页、595.28×841.89pt，渲染 PNG 核对与预览旋转/叠放/完整图一致；几何单测断言 CSS 与 Canvas 使用同一毫米值。
- 已通过：npm run check（13 tests，3 files，全通过；Vite 构建成功），git diff --check；测试页面无控制台 error。
- R3 发布已验证：源码提交 d6bff3e；GitHub Actions 33060744241 completed/success；线上 HTML 已引用 index-DMCfVmOt.js，线上主程序 SHA256 与本次本机构建相同。地址 https://sanqianup.github.io/a4-print-studio/ 。无图片上传、无用户源图片修改。
- 下一步：将本次临时克隆和下载的合成测试 PDF 移入回收站后交付；后续维护从 GitHub 临时克隆。仅本状态文档更新不重复部署已验证的相同源码。
- 阻塞：无。
