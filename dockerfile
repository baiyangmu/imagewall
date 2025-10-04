# 使用 Node.js 镜像作为基础镜像
FROM node:23 AS build

# 设置工作目录
WORKDIR /app

# 复制 package.json 和 package-lock.json 文件
COPY package.json package-lock.json ./
# COPY .env ./  # 如果没有.env文件，注释掉这行

# 安装依赖
RUN npm install

# 复制前端源代码
COPY ./public ./public
COPY ./src ./src


# 构建前端项目
RUN npm run build

# 使用 nginx 作为基础镜像
FROM nginx:alpine

# 复制前端构建产物到 nginx 的默认静态文件目录
COPY --from=build /app/build /usr/share/nginx/html

# 配置 Nginx - 修正路径
COPY ../nginx.conf /etc/nginx/nginx.conf

# 暴露端口
EXPOSE 80