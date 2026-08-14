# ===== 数字员工系统 · 多阶段构建 =====
# 阶段 1：构建前端
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm install --ignore-scripts --no-audit --no-fund
COPY web web
RUN npm run build -w web

# 阶段 2：运行（后端 + 前端静态资源 + SQLite）
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8787
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/server/package.json server/
COPY --from=build /app/web/package.json web/
RUN npm install --ignore-scripts --no-audit --no-fund --omit=dev
COPY --from=build /app/web/dist web/dist
COPY server server
RUN mkdir -p /app/server/data
# 数据卷：数据库 / 素材 / 成果文件（备份即成果）
VOLUME /app/server/data
EXPOSE 8787
# 首次启动自动初始化种子（4 名数字员工 + 素材样例 + 定时调度）
CMD ["node", "server/src/index.js"]
