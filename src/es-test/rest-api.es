# Elasticsearch 基本操作

# 1.查看所有索引
GET /_cat/indices?v&h=health,status,index,docs.count

# 2.创建索引
PUT /article
{
  "mappings": {
    "properties": {
      "title": {
        "type": "text"
      },
      "content": {
        "type": "text"
      },
      "author": {
        "type": "keyword"
      },
      "createTime": {
        "type": "date"
      },
      "viewCount": {
        "type": "integer"
      }
    }
  }
}

# 3.查看索引结构
GET /article/_mapping

# 4.产看索引配置
GET /article/_settings

# 5.删除索引
DELETE /article

# =========================
# 文档 增删改查
# =========================

# 1.新增文档 (自动生成ID)
POST /article/_doc
{
  "title": "Elasticsearch 入门指南",
  "content": "本文介绍了 Elasticsearch 的基本操作。",
  "author": "张三",
  "createTime": "2026-06-28T12:00:00",
  "viewCount": 100
}

# 2.新增文档 (指定ID)
PUT /article/_doc/1
{
  "title": "Elasticsearch 高级指南",
  "content": "本文介绍了 Elasticsearch 的高级操作。",
  "author": "李四",
  "createTime": "2026-06-29T12:00:00",
  "viewCount": 200
}

# 3.根据 ID 查询文档
GET /article/_doc/1

# 4.查询所有文档
GET /article/_search

# 5.全文分词检索（text 字段）
GET /article/_search
{
  "query": {
    "match": {
      "content": "基本"
    }
  }
}

# 6.精确检索（keyword 字段）
GET /article/_search
{
  "query": {
    "term": {
      "author": "张三"
    }
  }
}

# 7.只返回指定字段
GET /article/_search
{
  "_source": ["title", "author"],
  "query": {
    "match_all": {}
  }
}

# 8.分页 + 排序
GET /article/_search
{
  "from": 0,
  "size": 10,
  "sort": [
    {
      "viewCount": "desc"
    }
  ],
  "query": {
    "match_all": {}
  }
}

# 9.局部更新文档（推荐）
POST /article/_update/1
{
  "doc": {
    "viewCount": 300
  }
}

# 10.替换文档（不推荐）
PUT /article/_doc/1
{
  "title": "Elasticsearch 高级指南",
  "content": "本文介绍了 Elasticsearch 的高级操作。",
  "author": "李四",
  "createTime": "2026-06-29T12:00:00",
  "viewCount": 300
}

# 11.根据 ID 删除文档
DELETE /article/_doc/1

# 12.根据条件删除文档
POST /article/_delete_by_query
{
  "query": {
    "term": {
      "author": "张三"
    }
  }
}

# 13.统计文档总数
GET /article/_count


# 14.清空索引数据（保留表结构）
POST /article/_delete_by_query
{
  "query": {
    "match_all": {}
  }
}

# 15.查看分词器
GET /_analyze
{
  "analyzer": "standard",
  "text": "Elasticsearch 是一个分布式搜索引擎"
}

# 16.检查ES状态
GET /_cluster/health

GET /

# 17.产看已安装插件
GET /_cat/plugins?v

# 18.IK 细粒度分词（索引入库用）
GET /_analyze
{
  "analyzer": "ik_max_word",
  "text": "Elasticsearch 是一个分布式搜索引擎"
}

# 19.IK 粗粒度分词（搜索用）
GET /_analyze
{
  "analyzer": "ik_smart",
  "text": "Elasticsearch 是一个分布式搜索引擎"
}