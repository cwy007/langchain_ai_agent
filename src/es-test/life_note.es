# Elasticsearch IK 分词版操作手册
# 索引：life_note
# 字段全部配置 IK分词：入库 ik_max_word，搜索 ik_smart

# 1.查看所有索引
GET /_cat/indices?v

# 2.创建索引（生活笔记场景 + IK分词）
PUT /life_note
{
  "settings": {
    "number_of_shards": 1,
    "number_of_replicas": 0
  },
  "mappings": {
    "properties": {
      "title": {
        "type": "text",
        "analyzer": "ik_max_word",
        "search_analyzer": "ik_smart"
      },
      "content": {
        "type": "text",
        "analyzer": "ik_max_word",
        "search_analyzer": "ik_smart"
      },
      "type": {
        "type": "keyword"
      },
      "author": {
        "type": "keyword"
      },
      "recorded_time": {
        "type": "date"
      }
    }
  }
}

# 3.查看索引结构
GET /life_note/_mapping

# 4.产看索引配置
GET /life_note/_settings

# 5.删除索引
DELETE /life_note

## =========================
# 文档 增删改查（生活日常案例）
## =========================

# 1.新增文档 (自动生成ID)
POST /life_note/_doc
{
  "title": "今天的心情",
  "content": "今天心情不错，阳光明媚。",
  "type": "心情",
  "author": "小明",
  "recorded_time": "2026-06-28T12:00:00"
}

# 2.新增文档 (指定ID)
PUT /life_note/_doc/3001
{
  "title": "今天的工作",
  "content": "今天完成了一个重要的项目。",
  "type": "工作",
  "author": "小明",
  "recorded_time": "2026-06-29T12:00:00"
}

# 3.根据 ID 查询文档
GET /life_note/_doc/3001

# 4.查询所有文档
GET /life_note/_search
{
  "query": {
    "match_all": {}
  }
}


# 5.全文分词检索（text 字段）
GET /life_note/_search
{
  "query": {
    "match": {
      "content": "心情"
    }
  }
}

# 6.精确检索（keyword 字段）
GET /life_note/_search
{
  "query": {
    "term": {
      "type": "心情"
    }
  }
}

# 7.只返回指定字段
GET /life_note/_search
{
  "_source": ["title", "author"],
  "query": {
    "match_all": {}
  }
}

# 8.分页 + 时间排序
GET /life_note/_search
{
  "from": 0,
  "size": 10,
  "sort": [
    {
      "recorded_time": {
        "order": "desc"
      }
    }
  ],
  "query": {
    "match_all": {}
  }
}

# 9.局部更新文档（推荐）
POST /life_note/_update/3001
{
  "doc": {
    "content": "今天完成了一个重要的项目，心情非常好！"
  }
}

# 10.替换文档（不推荐）
PUT /life_note/_doc/3001
{
  "title": "今天的工作",
  "content": "今天完成了一个重要的项目，心情非常好！",
  "type": "工作",
  "author": "小明",
  "recorded_time": "2026-06-29T12:00:00"
}

# 11.根据 ID 删除文档
DELETE /life_note/_doc/3001

# 12.条件批量删除
POST /life_note/_delete_by_query
{
  "query": {
    "term": {
      "type": "工作"
    }
  }
}

# 13.统计文档总数
GET /life_note/_count

# 14.清空索引数据（保留表结构）
POST /life_note/_delete_by_query
{
  "query": {
    "match_all": {}
  }
}

## =========================
# IK 分词器测试
## =========================

# 1.IK 细粒度分词（入库存储使用）
GET /_analyze
{
  "analyzer": "ik_max_word",
  "text": "今天心情不错，阳光明媚。"
}

# 2.IK 粗粒度分词（搜索使用）
GET /_analyze
{
  "analyzer": "ik_smart",
  "text": "今天心情不错，阳光明媚。"
}
