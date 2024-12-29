# 使用 Node.js 23 作为基础镜像
FROM node:23 AS build

# 设置工作目录
WORKDIR /app

# 将 package.json 和 package-lock.json 文件复制到容器中
COPY package*.json ./

# 安装依赖
RUN npm install

# 将所有文件复制到容器中
COPY . .

# 构建 React 项目
RUN npm run build

# 使用 nginx 镜像来托管构建后的前端项目
FROM nginx:alpine

# 将构建后的文件复制到 nginx 的默认目录
COPY --from=build /app/build /usr/share/nginx/html

# 暴露端口 80
EXPOSE 80
