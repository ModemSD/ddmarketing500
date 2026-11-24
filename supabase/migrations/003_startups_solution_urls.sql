-- Ссылки на решение (продукт/сайт/бот) для каждого стартапа
ALTER TABLE startups
ADD COLUMN IF NOT EXISTS solution_urls TEXT[] NOT NULL DEFAULT '{}';
