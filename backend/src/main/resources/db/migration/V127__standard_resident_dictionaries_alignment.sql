-- V127__standard_resident_dictionaries_alignment.sql
-- Align patient basic information dictionaries with Jiangsu Health Information Dataset (2023 edition)

-- 1. Clean Existing Dictionary Items (FK constraint safe)
delete from dictionary_items where dictionary_id in (362387869841107, 362387869841111, 362387869841112, 362387869841109, 362387869841113, 362387869841110, 362387869841101, 362387869841105, 362387869841106) or dictionary_id in (select id from dictionary_definitions where code in ('PI_IDENTIFIER_TYPE', 'PI_NATIONALITY', 'PI_ETHNICITY', 'PI_EDUCATION_LEVEL', 'PI_EMPLOYMENT_STATUS', 'PI_OCCUPATION_TYPE', 'PI_MARITAL_STATUS', 'PI_RELATED_PERSON_RELATIONSHIP', 'INS_COVERAGE_TYPE'));

-- 2. Create or Update Dictionary Definitions
delete from dictionary_definitions where id in (362387869841107, 362387869841111, 362387869841112, 362387869841109, 362387869841113, 362387869841110, 362387869841101, 362387869841105, 362387869841106) or code in ('PI_IDENTIFIER_TYPE', 'PI_NATIONALITY', 'PI_ETHNICITY', 'PI_EDUCATION_LEVEL', 'PI_EMPLOYMENT_STATUS', 'PI_OCCUPATION_TYPE', 'PI_MARITAL_STATUS', 'PI_RELATED_PERSON_RELATIONSHIP', 'INS_COVERAGE_TYPE');
insert into dictionary_definitions (
    id, revision, scope_type, scope_code, tenant_id, code, name, description,
    system_managed, status, created_at, created_by, updated_at, updated_by, category_id
) values (362387869841107, 0, 'PLATFORM', 'PLATFORM', null, 'PI_IDENTIFIER_TYPE', '身份证件类别代码',
    'RC038 国家公立医院绩效考核患者证件类别代码', false, 'ACTIVE', current_timestamp, 362387869790222,
    current_timestamp, 362387869790222, 362387869841000);

insert into dictionary_definitions (
    id, revision, scope_type, scope_code, tenant_id, code, name, description,
    system_managed, status, created_at, created_by, updated_at, updated_by, category_id
) values (362387869841111, 0, 'PLATFORM', 'PLATFORM', null, 'PI_NATIONALITY', '国籍代码表',
    'GB/T 2659-2000 世界各国和地区名称代码', false, 'ACTIVE', current_timestamp, 362387869790222,
    current_timestamp, 362387869790222, 362387869841000);

insert into dictionary_definitions (
    id, revision, scope_type, scope_code, tenant_id, code, name, description,
    system_managed, status, created_at, created_by, updated_at, updated_by, category_id
) values (362387869841112, 0, 'PLATFORM', 'PLATFORM', null, 'PI_ETHNICITY', '民族分类代码',
    'GB/T 3304-1991 中国各民族名称的罗马字母拼写法和代码', false, 'ACTIVE', current_timestamp, 362387869790222,
    current_timestamp, 362387869790222, 362387869841000);

insert into dictionary_definitions (
    id, revision, scope_type, scope_code, tenant_id, code, name, description,
    system_managed, status, created_at, created_by, updated_at, updated_by, category_id
) values (362387869841109, 0, 'PLATFORM', 'PLATFORM', null, 'PI_EDUCATION_LEVEL', '文化程度代码',
    'GB 4658-2006 学历代码（大类）', false, 'ACTIVE', current_timestamp, 362387869790222,
    current_timestamp, 362387869790222, 362387869841000);

insert into dictionary_definitions (
    id, revision, scope_type, scope_code, tenant_id, code, name, description,
    system_managed, status, created_at, created_by, updated_at, updated_by, category_id
) values (362387869841113, 0, 'PLATFORM', 'PLATFORM', null, 'PI_EMPLOYMENT_STATUS', '从业状况分类',
    'GB/T 2261.4-2003 个人基本信息分类与代码 第4部分：从业状况代码', false, 'ACTIVE', current_timestamp, 362387869790222,
    current_timestamp, 362387869790222, 362387869841000);

insert into dictionary_definitions (
    id, revision, scope_type, scope_code, tenant_id, code, name, description,
    system_managed, status, created_at, created_by, updated_at, updated_by, category_id
) values (362387869841110, 0, 'PLATFORM', 'PLATFORM', null, 'PI_OCCUPATION_TYPE', '职业分类代码',
    'GB/T 6565-2015 职业分类与代码', false, 'ACTIVE', current_timestamp, 362387869790222,
    current_timestamp, 362387869790222, 362387869841000);

insert into dictionary_definitions (
    id, revision, scope_type, scope_code, tenant_id, code, name, description,
    system_managed, status, created_at, created_by, updated_at, updated_by, category_id
) values (362387869841101, 0, 'PLATFORM', 'PLATFORM', null, 'PI_MARITAL_STATUS', '婚姻代码',
    'GB/T 4766-1984 婚姻状况代码', false, 'ACTIVE', current_timestamp, 362387869790222,
    current_timestamp, 362387869790222, 362387869841000);

insert into dictionary_definitions (
    id, revision, scope_type, scope_code, tenant_id, code, name, description,
    system_managed, status, created_at, created_by, updated_at, updated_by, category_id
) values (362387869841105, 0, 'PLATFORM', 'PLATFORM', null, 'PI_RELATED_PERSON_RELATIONSHIP', '家庭关系代码',
    'GB/T 4761-2008 家庭关系代码', false, 'ACTIVE', current_timestamp, 362387869790222,
    current_timestamp, 362387869790222, 362387869841000);

insert into dictionary_definitions (
    id, revision, scope_type, scope_code, tenant_id, code, name, description,
    system_managed, status, created_at, created_by, updated_at, updated_by, category_id
) values (362387869841106, 0, 'PLATFORM', 'PLATFORM', null, 'INS_COVERAGE_TYPE', '医疗费用类别代码',
    'CV07.10.003-2022 江苏扩展码', false, 'ACTIVE', current_timestamp, 362387869790222,
    current_timestamp, 362387869790222, 362387869841000);

-- 3. Insert Official Standard Dictionary Items
-- 身份证件类别代码 (PI_IDENTIFIER_TYPE) - 7 items
insert into dictionary_items values (362387869841400, 362387869841107, '1', '居民身份证', null, 10, 'ACTIVE');
insert into dictionary_items values (362387869841401, 362387869841107, '2', '中国人民解放军军人身份证件', null, 20, 'ACTIVE');
insert into dictionary_items values (362387869841402, 362387869841107, '3', '中国人民武装警察身份证件', null, 30, 'ACTIVE');
insert into dictionary_items values (362387869841403, 362387869841107, '4', '港澳居民来往内地通行证', '仅限港澳居民使用', 40, 'ACTIVE');
insert into dictionary_items values (362387869841404, 362387869841107, '5', '台湾居民来往大陆通行证', '仅限台湾居民使用', 50, 'ACTIVE');
insert into dictionary_items values (362387869841405, 362387869841107, '6', '护照', '仅限外籍人员使用', 60, 'ACTIVE');
insert into dictionary_items values (362387869841406, 362387869841107, '9', '其他', null, 70, 'ACTIVE');

-- 国籍代码表 (PI_NATIONALITY) - 239 items
insert into dictionary_items values (362387869841500, 362387869841111, 'AF', '阿富汗', 'AFGHANISTAN', 10, 'ACTIVE');
insert into dictionary_items values (362387869841501, 362387869841111, 'AL', '阿尔巴尼亚', 'ALBANIA', 20, 'ACTIVE');
insert into dictionary_items values (362387869841502, 362387869841111, 'DZ', '阿尔及利亚', 'ALGERIA', 30, 'ACTIVE');
insert into dictionary_items values (362387869841503, 362387869841111, 'AS', '美属萨摩亚', 'AMERICAN SAMOA', 40, 'ACTIVE');
insert into dictionary_items values (362387869841504, 362387869841111, 'AD', '安道尔', 'ANDORRA', 50, 'ACTIVE');
insert into dictionary_items values (362387869841505, 362387869841111, 'AO', '安哥拉', 'ANGOLA', 60, 'ACTIVE');
insert into dictionary_items values (362387869841506, 362387869841111, 'AI', '安圭拉', 'ANGUILLA', 70, 'ACTIVE');
insert into dictionary_items values (362387869841507, 362387869841111, 'AQ', '南极洲', 'ANTARCTICA', 80, 'ACTIVE');
insert into dictionary_items values (362387869841508, 362387869841111, 'AG', '安提瓜和巴布达', 'ANTIGUA AND BARBUDA', 90, 'ACTIVE');
insert into dictionary_items values (362387869841509, 362387869841111, 'AR', '阿根廷', 'ARGENTINA', 100, 'ACTIVE');
insert into dictionary_items values (362387869841510, 362387869841111, 'AM', '亚美尼亚', 'ARMENIA', 110, 'ACTIVE');
insert into dictionary_items values (362387869841511, 362387869841111, 'AW', '阿鲁巴', 'ARUBA', 120, 'ACTIVE');
insert into dictionary_items values (362387869841512, 362387869841111, 'AU', '澳大利亚', 'AUSTRALIA', 130, 'ACTIVE');
insert into dictionary_items values (362387869841513, 362387869841111, 'AT', '奥地利', 'AUSTRIA', 140, 'ACTIVE');
insert into dictionary_items values (362387869841514, 362387869841111, 'AZ', '阿塞拜疆', 'AZERBAIJAN', 150, 'ACTIVE');
insert into dictionary_items values (362387869841515, 362387869841111, 'BS', '巴哈马', 'BAHAMAS', 160, 'ACTIVE');
insert into dictionary_items values (362387869841516, 362387869841111, 'BH', '巴林', 'BAHRAIN', 170, 'ACTIVE');
insert into dictionary_items values (362387869841517, 362387869841111, 'BD', '孟加拉国', 'BANGLADESH', 180, 'ACTIVE');
insert into dictionary_items values (362387869841518, 362387869841111, 'BB', '巴巴多斯', 'BARBADOS', 190, 'ACTIVE');
insert into dictionary_items values (362387869841519, 362387869841111, 'BY', '白俄罗斯', 'BELARUS', 200, 'ACTIVE');
insert into dictionary_items values (362387869841520, 362387869841111, 'BE', '比利时', 'BELGIUM', 210, 'ACTIVE');
insert into dictionary_items values (362387869841521, 362387869841111, 'BZ', '伯利兹', 'BELIZE', 220, 'ACTIVE');
insert into dictionary_items values (362387869841522, 362387869841111, 'BJ', '贝宁', 'BENIN', 230, 'ACTIVE');
insert into dictionary_items values (362387869841523, 362387869841111, 'BM', '百慕大', 'BERMUDA', 240, 'ACTIVE');
insert into dictionary_items values (362387869841524, 362387869841111, 'BT', '不丹', 'BHUTAN', 250, 'ACTIVE');
insert into dictionary_items values (362387869841525, 362387869841111, 'BO', '玻利维亚', 'BOLIVIA', 260, 'ACTIVE');
insert into dictionary_items values (362387869841526, 362387869841111, 'BA', '波黑', 'BOSNIA AND HERZEGOVINA', 270, 'ACTIVE');
insert into dictionary_items values (362387869841527, 362387869841111, 'BW', '博茨瓦纳', 'BOTSWANA', 280, 'ACTIVE');
insert into dictionary_items values (362387869841528, 362387869841111, 'BV', '布维岛', 'BOUVET ISLAND', 290, 'ACTIVE');
insert into dictionary_items values (362387869841529, 362387869841111, 'BR', '巴西', 'BRAZIL', 300, 'ACTIVE');
insert into dictionary_items values (362387869841530, 362387869841111, 'IO', '英属印度洋领土', 'BRITISH INDIAN OCEAN TER-RITORY', 310, 'ACTIVE');
insert into dictionary_items values (362387869841531, 362387869841111, 'BN', '文莱', 'BRUNEI DARUSSALAM', 320, 'ACTIVE');
insert into dictionary_items values (362387869841532, 362387869841111, 'BG', '保加利亚', 'BULGARIA', 330, 'ACTIVE');
insert into dictionary_items values (362387869841533, 362387869841111, 'BF', '布基纳法索', 'BURKINA FASO', 340, 'ACTIVE');
insert into dictionary_items values (362387869841534, 362387869841111, 'BI', '布隆迪', 'BURUNDI', 350, 'ACTIVE');
insert into dictionary_items values (362387869841535, 362387869841111, 'KH', '柬埔寨', 'CAMBODIA', 360, 'ACTIVE');
insert into dictionary_items values (362387869841536, 362387869841111, 'CM', '喀麦隆', 'CAMEROON', 370, 'ACTIVE');
insert into dictionary_items values (362387869841537, 362387869841111, 'CA', '加拿大', 'CANADA', 380, 'ACTIVE');
insert into dictionary_items values (362387869841538, 362387869841111, 'CV', '佛得角', 'CAPE VERDE', 390, 'ACTIVE');
insert into dictionary_items values (362387869841539, 362387869841111, 'KY', '开曼群岛', 'CAYMAN ISLANDS', 400, 'ACTIVE');
insert into dictionary_items values (362387869841540, 362387869841111, 'CF', '中非', 'CENTRAL AFRICA', 410, 'ACTIVE');
insert into dictionary_items values (362387869841541, 362387869841111, 'TD', '乍得', 'CHAD', 420, 'ACTIVE');
insert into dictionary_items values (362387869841542, 362387869841111, 'CL', '智利', 'CHILE', 430, 'ACTIVE');
insert into dictionary_items values (362387869841543, 362387869841111, 'CN', '中国', 'CHINA', 440, 'ACTIVE');
insert into dictionary_items values (362387869841544, 362387869841111, 'HK', '中国香港', 'HONG KONG', 450, 'ACTIVE');
insert into dictionary_items values (362387869841545, 362387869841111, 'MO', '中国澳门', 'MACAU', 460, 'ACTIVE');
insert into dictionary_items values (362387869841546, 362387869841111, 'TW', '中国台湾', 'TAIWAN, PROVINCE OF CHINA', 470, 'ACTIVE');
insert into dictionary_items values (362387869841547, 362387869841111, 'CS', '圣诞岛', 'CHRISTMAS ISLAND', 480, 'ACTIVE');
insert into dictionary_items values (362387869841548, 362387869841111, 'CC', '科科斯(基林)群岛', 'COCOS(KEELING) ISLANDS', 490, 'ACTIVE');
insert into dictionary_items values (362387869841549, 362387869841111, 'Co', '哥伦比亚', 'COLOMBIA', 500, 'ACTIVE');
insert into dictionary_items values (362387869841550, 362387869841111, 'KM', '科摩罗', 'COMOROS', 510, 'ACTIVE');
insert into dictionary_items values (362387869841551, 362387869841111, 'CG', '刚果（布）', 'CONGO', 520, 'ACTIVE');
insert into dictionary_items values (362387869841552, 362387869841111, 'CD', '刚果（金）', 'CONGO, THE DEMOCRATIC REPUBLIC OF THE', 530, 'ACTIVE');
insert into dictionary_items values (362387869841553, 362387869841111, 'CK', '库克群岛', 'COOK ISLANDS', 540, 'ACTIVE');
insert into dictionary_items values (362387869841554, 362387869841111, 'CR', '哥斯达黎加', 'COSTA RICA', 550, 'ACTIVE');
insert into dictionary_items values (362387869841555, 362387869841111, 'CI', '科特迪瓦', 'COTE D''IVOIRE', 560, 'ACTIVE');
insert into dictionary_items values (362387869841556, 362387869841111, 'HR', '克罗地亚', 'CROATIA', 570, 'ACTIVE');
insert into dictionary_items values (362387869841557, 362387869841111, 'CU', '古巴', 'CUBA', 580, 'ACTIVE');
insert into dictionary_items values (362387869841558, 362387869841111, 'CY', '塞浦路斯', 'CYPRUS', 590, 'ACTIVE');
insert into dictionary_items values (362387869841559, 362387869841111, 'CZ', '捷克', 'CZECH REPOUBLIC', 600, 'ACTIVE');
insert into dictionary_items values (362387869841560, 362387869841111, 'DK', '丹麦', 'DENMARK', 610, 'ACTIVE');
insert into dictionary_items values (362387869841561, 362387869841111, 'DJ', '吉布提', 'DJIBOUTI', 620, 'ACTIVE');
insert into dictionary_items values (362387869841562, 362387869841111, 'DM', '多米尼克', 'DOMINICA', 630, 'ACTIVE');
insert into dictionary_items values (362387869841563, 362387869841111, 'DO', '多米尼加共和国', 'DOMINICAN REPUBLIC', 640, 'ACTIVE');
insert into dictionary_items values (362387869841564, 362387869841111, 'TP', '东帝汶', 'EAST TIMOR', 650, 'ACTIVE');
insert into dictionary_items values (362387869841565, 362387869841111, 'EC', '厄瓜多尔', 'ECUADOR', 660, 'ACTIVE');
insert into dictionary_items values (362387869841566, 362387869841111, 'EG', '埃及', 'EGYPT', 670, 'ACTIVE');
insert into dictionary_items values (362387869841567, 362387869841111, 'SV', '萨尔瓦多', 'EL SALVADOR', 680, 'ACTIVE');
insert into dictionary_items values (362387869841568, 362387869841111, 'GQ', '赤道几内亚', 'EQUATORIAL GUINEA', 690, 'ACTIVE');
insert into dictionary_items values (362387869841569, 362387869841111, 'ER', '厄立特里亚', 'ERITREA', 700, 'ACTIVE');
insert into dictionary_items values (362387869841570, 362387869841111, 'EE', '爱沙尼亚', 'ESTONIA', 710, 'ACTIVE');
insert into dictionary_items values (362387869841571, 362387869841111, 'ET', '埃塞俄比亚', 'ETHIOPIA', 720, 'ACTIVE');
insert into dictionary_items values (362387869841572, 362387869841111, 'FK', '福克兰群岛(马尔维纳斯)', 'FALKLAND ISLANDS(MALVINAS)', 730, 'ACTIVE');
insert into dictionary_items values (362387869841573, 362387869841111, 'FO', '法罗群岛', 'FAROE ISLANDS', 740, 'ACTIVE');
insert into dictionary_items values (362387869841574, 362387869841111, 'FJ', '斐济', 'FIJI', 750, 'ACTIVE');
insert into dictionary_items values (362387869841575, 362387869841111, 'FI', '芬兰', 'FINLAND', 760, 'ACTIVE');
insert into dictionary_items values (362387869841576, 362387869841111, 'FR', '法国', 'FRANCE', 770, 'ACTIVE');
insert into dictionary_items values (362387869841577, 362387869841111, 'GF', '法属圭亚那', 'FRENCH GUIANA', 780, 'ACTIVE');
insert into dictionary_items values (362387869841578, 362387869841111, 'PF', '法属波利尼西亚', 'FRENCH POLYNESIA', 790, 'ACTIVE');
insert into dictionary_items values (362387869841579, 362387869841111, 'TF', '法属南部领土', 'FRENCH SOUTHERN TERRITO-RIES', 800, 'ACTIVE');
insert into dictionary_items values (362387869841580, 362387869841111, 'GA', '加蓬', 'GABON', 810, 'ACTIVE');
insert into dictionary_items values (362387869841581, 362387869841111, 'GM', '冈比亚', 'Gambia', 820, 'ACTIVE');
insert into dictionary_items values (362387869841582, 362387869841111, 'GE', '格鲁吉亚', 'GEORGIA', 830, 'ACTIVE');
insert into dictionary_items values (362387869841583, 362387869841111, 'DE', '德国', 'GERMANY', 840, 'ACTIVE');
insert into dictionary_items values (362387869841584, 362387869841111, 'GH', '加纳', 'GHANA', 850, 'ACTIVE');
insert into dictionary_items values (362387869841585, 362387869841111, 'GI', '直布罗陀', 'GIBRALTAR', 860, 'ACTIVE');
insert into dictionary_items values (362387869841586, 362387869841111, 'GR', '希腊', 'GREECE', 870, 'ACTIVE');
insert into dictionary_items values (362387869841587, 362387869841111, 'GL', '格陵兰', 'GREENLAND', 880, 'ACTIVE');
insert into dictionary_items values (362387869841588, 362387869841111, 'GD', '格林纳达', 'GRENADA', 890, 'ACTIVE');
insert into dictionary_items values (362387869841589, 362387869841111, 'GP', '瓜德罗普', 'GUADELOUPE', 900, 'ACTIVE');
insert into dictionary_items values (362387869841590, 362387869841111, 'GU', '关岛', 'GUAM', 910, 'ACTIVE');
insert into dictionary_items values (362387869841591, 362387869841111, 'GT', '危地马拉', 'GUATEMALA', 920, 'ACTIVE');
insert into dictionary_items values (362387869841592, 362387869841111, 'GN', '几内亚', 'GUINEA', 930, 'ACTIVE');
insert into dictionary_items values (362387869841593, 362387869841111, 'GW', '几内亚比绍', 'GUINE-BISSAU', 940, 'ACTIVE');
insert into dictionary_items values (362387869841594, 362387869841111, 'GY', '圭亚那', 'GUYANA', 950, 'ACTIVE');
insert into dictionary_items values (362387869841595, 362387869841111, 'HT', '海地', 'HAITI', 960, 'ACTIVE');
insert into dictionary_items values (362387869841596, 362387869841111, 'HM', '赫德岛和麦克唐纳岛', 'HEARD ISLANDS AND MC DONALD ISLANDS', 970, 'ACTIVE');
insert into dictionary_items values (362387869841597, 362387869841111, 'HN', '洪都拉斯', 'HONDURAS', 980, 'ACTIVE');
insert into dictionary_items values (362387869841598, 362387869841111, 'HU', '匈牙利', 'HUNGARY', 990, 'ACTIVE');
insert into dictionary_items values (362387869841599, 362387869841111, 'IS', '冰岛', 'ICELAND', 1000, 'ACTIVE');
insert into dictionary_items values (362387869841600, 362387869841111, 'IN', '印度', 'INDIA', 1010, 'ACTIVE');
insert into dictionary_items values (362387869841601, 362387869841111, 'ID', '印度尼西亚', 'INDONESIA', 1020, 'ACTIVE');
insert into dictionary_items values (362387869841602, 362387869841111, 'IR', '伊朗', 'IRAN', 1030, 'ACTIVE');
insert into dictionary_items values (362387869841603, 362387869841111, 'IQ', '伊拉克', 'IRAQ', 1040, 'ACTIVE');
insert into dictionary_items values (362387869841604, 362387869841111, 'IE', '爱尔兰', 'IRELAND', 1050, 'ACTIVE');
insert into dictionary_items values (362387869841605, 362387869841111, 'IL', '以色列', 'ISRAEL', 1060, 'ACTIVE');
insert into dictionary_items values (362387869841606, 362387869841111, 'IT', '意大利', 'ITALY', 1070, 'ACTIVE');
insert into dictionary_items values (362387869841607, 362387869841111, 'JM', '牙买加', 'JAMAICA', 1080, 'ACTIVE');
insert into dictionary_items values (362387869841608, 362387869841111, 'JP', '日本', 'JAPAN', 1090, 'ACTIVE');
insert into dictionary_items values (362387869841609, 362387869841111, 'JO', '约旦', 'JORDAN', 1100, 'ACTIVE');
insert into dictionary_items values (362387869841610, 362387869841111, 'KZ', '哈萨克斯坦', 'KAZAKHSTAN', 1110, 'ACTIVE');
insert into dictionary_items values (362387869841611, 362387869841111, 'KE', '肯尼亚', 'KENYA', 1120, 'ACTIVE');
insert into dictionary_items values (362387869841612, 362387869841111, 'KI', '基里巴斯', 'KIRIBATI', 1130, 'ACTIVE');
insert into dictionary_items values (362387869841613, 362387869841111, 'KP', '朝鲜', 'KOREA,DEMOCRATIC PEOPLE''S REPUBLIC OF', 1140, 'ACTIVE');
insert into dictionary_items values (362387869841614, 362387869841111, 'KR', '韩国', 'KOREA,REPUBLIC OF', 1150, 'ACTIVE');
insert into dictionary_items values (362387869841615, 362387869841111, 'KW', '科威特', 'KUWAIT', 1160, 'ACTIVE');
insert into dictionary_items values (362387869841616, 362387869841111, 'KG', '吉尔吉斯斯坦', 'KYRGYZSTAN', 1170, 'ACTIVE');
insert into dictionary_items values (362387869841617, 362387869841111, 'LA', '老挝', 'LAOS', 1180, 'ACTIVE');
insert into dictionary_items values (362387869841618, 362387869841111, 'LV', '拉脱维亚', 'LATVIA', 1190, 'ACTIVE');
insert into dictionary_items values (362387869841619, 362387869841111, 'LB', '黎巴嫩', 'LEBANON', 1200, 'ACTIVE');
insert into dictionary_items values (362387869841620, 362387869841111, 'LS', '莱索托', 'LESOTHO', 1210, 'ACTIVE');
insert into dictionary_items values (362387869841621, 362387869841111, 'LR', '利比里亚', 'LIBERIA', 1220, 'ACTIVE');
insert into dictionary_items values (362387869841622, 362387869841111, 'LY', '利比亚', 'LIBYA', 1230, 'ACTIVE');
insert into dictionary_items values (362387869841623, 362387869841111, 'LI', '列支敦士登', 'LIECHTENSTEIN', 1240, 'ACTIVE');
insert into dictionary_items values (362387869841624, 362387869841111, 'LT', '立陶宛', 'LITHUANIA', 1250, 'ACTIVE');
insert into dictionary_items values (362387869841625, 362387869841111, 'LU', '卢森堡', 'LUXEMBOURG', 1260, 'ACTIVE');
insert into dictionary_items values (362387869841626, 362387869841111, 'MK', '前南马其顿', 'MACEDONIA, THE FORMER YUGOSLAV REPUBLIC OF', 1270, 'ACTIVE');
insert into dictionary_items values (362387869841627, 362387869841111, 'MG', '马达加斯加', 'MADAGASCAR', 1280, 'ACTIVE');
insert into dictionary_items values (362387869841628, 362387869841111, 'MW', '马拉维', 'MALAWI', 1290, 'ACTIVE');
insert into dictionary_items values (362387869841629, 362387869841111, 'MY', '马来西亚', 'MALAYSIA', 1300, 'ACTIVE');
insert into dictionary_items values (362387869841630, 362387869841111, 'MV', '马尔代夫', 'MALDIVES', 1310, 'ACTIVE');
insert into dictionary_items values (362387869841631, 362387869841111, 'ML', '马里', 'MALI', 1320, 'ACTIVE');
insert into dictionary_items values (362387869841632, 362387869841111, 'MT', '马耳他', 'MALTA', 1330, 'ACTIVE');
insert into dictionary_items values (362387869841633, 362387869841111, 'MH', '马绍尔群岛', 'MARSHALL ISLANDS', 1340, 'ACTIVE');
insert into dictionary_items values (362387869841634, 362387869841111, 'MQ', '马提尼克', 'MARTINIQUE', 1350, 'ACTIVE');
insert into dictionary_items values (362387869841635, 362387869841111, 'MR', '毛里塔尼亚', 'MAURITANIA', 1360, 'ACTIVE');
insert into dictionary_items values (362387869841636, 362387869841111, 'MU', '毛里求斯', 'MAURITIUS', 1370, 'ACTIVE');
insert into dictionary_items values (362387869841637, 362387869841111, 'YT', '马约特', 'MAYOTTE', 1380, 'ACTIVE');
insert into dictionary_items values (362387869841638, 362387869841111, 'MX', '墨西哥', 'MEXICO', 1390, 'ACTIVE');
insert into dictionary_items values (362387869841639, 362387869841111, 'FM', '密克罗尼西亚联邦', 'MICRONESIA, FEDERATED STATES OF', 1400, 'ACTIVE');
insert into dictionary_items values (362387869841640, 362387869841111, 'MD', '摩尔多瓦', 'MOLDOVA', 1410, 'ACTIVE');
insert into dictionary_items values (362387869841641, 362387869841111, 'MC', '摩纳哥', 'MONACO', 1420, 'ACTIVE');
insert into dictionary_items values (362387869841642, 362387869841111, 'MN', '蒙古', 'MONGOLIA', 1430, 'ACTIVE');
insert into dictionary_items values (362387869841643, 362387869841111, 'MS', '蒙特塞拉特', 'MONTSERRAT', 1440, 'ACTIVE');
insert into dictionary_items values (362387869841644, 362387869841111, 'MA', '摩洛哥', 'MOROCCO', 1450, 'ACTIVE');
insert into dictionary_items values (362387869841645, 362387869841111, 'MZ', '莫桑比克', 'MOZAMBIQUE', 1460, 'ACTIVE');
insert into dictionary_items values (362387869841646, 362387869841111, 'MM', '缅甸', 'MYANMAR', 1470, 'ACTIVE');
insert into dictionary_items values (362387869841647, 362387869841111, 'NA', '纳米比亚', 'NAMIBIA', 1480, 'ACTIVE');
insert into dictionary_items values (362387869841648, 362387869841111, 'NR', '瑙鲁', 'NAURU', 1490, 'ACTIVE');
insert into dictionary_items values (362387869841649, 362387869841111, 'NP', '尼泊尔', 'NEPAL', 1500, 'ACTIVE');
insert into dictionary_items values (362387869841650, 362387869841111, 'NL', '荷兰', 'NETHERLANDS', 1510, 'ACTIVE');
insert into dictionary_items values (362387869841651, 362387869841111, 'AN', '荷属安的列斯', 'NETHERLANDS ANTILLES', 1520, 'ACTIVE');
insert into dictionary_items values (362387869841652, 362387869841111, 'NC', '新喀里多尼亚', 'NEW CALEDONIA', 1530, 'ACTIVE');
insert into dictionary_items values (362387869841653, 362387869841111, 'NZ', '新西兰', 'NEW ZEALAND', 1540, 'ACTIVE');
insert into dictionary_items values (362387869841654, 362387869841111, 'NI', '尼加拉瓜', 'NICARAGUA', 1550, 'ACTIVE');
insert into dictionary_items values (362387869841655, 362387869841111, 'NE', '尼日尔', 'NIGER', 1560, 'ACTIVE');
insert into dictionary_items values (362387869841656, 362387869841111, 'NG', '尼日利亚', 'NIGERIA', 1570, 'ACTIVE');
insert into dictionary_items values (362387869841657, 362387869841111, 'NU', '纽埃', 'NIUE', 1580, 'ACTIVE');
insert into dictionary_items values (362387869841658, 362387869841111, 'NF', '诺福克岛', 'NORFOLK ISLAND', 1590, 'ACTIVE');
insert into dictionary_items values (362387869841659, 362387869841111, 'MP', '北马里亚纳', 'NORTHERN MARIANAS', 1600, 'ACTIVE');
insert into dictionary_items values (362387869841660, 362387869841111, 'NO', '挪威', 'NORWAY', 1610, 'ACTIVE');
insert into dictionary_items values (362387869841661, 362387869841111, 'OM', '阿曼', 'OMAN', 1620, 'ACTIVE');
insert into dictionary_items values (362387869841662, 362387869841111, 'PK', '巴基斯坦', 'PAKISTAN', 1630, 'ACTIVE');
insert into dictionary_items values (362387869841663, 362387869841111, 'PW', '帕劳', 'PALAU', 1640, 'ACTIVE');
insert into dictionary_items values (362387869841664, 362387869841111, 'PS', '巴勒斯坦', 'PALESTINE', 1650, 'ACTIVE');
insert into dictionary_items values (362387869841665, 362387869841111, 'PA', '巴拿马', 'PANAMA', 1660, 'ACTIVE');
insert into dictionary_items values (362387869841666, 362387869841111, 'PG', '巴布亚新几内亚', 'PAPUA NEW GUINEA', 1670, 'ACTIVE');
insert into dictionary_items values (362387869841667, 362387869841111, 'PY', '巴拉圭', 'PARAGUAY', 1680, 'ACTIVE');
insert into dictionary_items values (362387869841668, 362387869841111, 'PE', '秘鲁', 'PERU', 1690, 'ACTIVE');
insert into dictionary_items values (362387869841669, 362387869841111, 'PH', '菲律宾', 'PHILIPPINES', 1700, 'ACTIVE');
insert into dictionary_items values (362387869841670, 362387869841111, 'PN', '皮特凯恩群岛', 'PITCAIRN ISLANDS GROUP', 1710, 'ACTIVE');
insert into dictionary_items values (362387869841671, 362387869841111, 'PL', '波兰', 'POLAND', 1720, 'ACTIVE');
insert into dictionary_items values (362387869841672, 362387869841111, 'PT', '葡萄牙', 'PORTUGAL', 1730, 'ACTIVE');
insert into dictionary_items values (362387869841673, 362387869841111, 'PR', '波多黎各', 'PUERTO RICO', 1740, 'ACTIVE');
insert into dictionary_items values (362387869841674, 362387869841111, 'QA', '卡塔尔', 'QATAR', 1750, 'ACTIVE');
insert into dictionary_items values (362387869841675, 362387869841111, 'RE', '留尼汪', 'REUNION', 1760, 'ACTIVE');
insert into dictionary_items values (362387869841676, 362387869841111, 'RO', '罗马尼亚', 'ROMANIA', 1770, 'ACTIVE');
insert into dictionary_items values (362387869841677, 362387869841111, 'RU', '俄罗斯联邦', 'RUSSIAN FEDERATION', 1780, 'ACTIVE');
insert into dictionary_items values (362387869841678, 362387869841111, 'RW', '卢旺达', 'RWANDA', 1790, 'ACTIVE');
insert into dictionary_items values (362387869841679, 362387869841111, 'Sh', '圣赫勒拿', 'SAINT HELENA', 1800, 'ACTIVE');
insert into dictionary_items values (362387869841680, 362387869841111, 'KN', '圣基茨和尼维斯', 'SAINT KITTS AND NEVIS', 1810, 'ACTIVE');
insert into dictionary_items values (362387869841681, 362387869841111, 'LC', '圣卢西亚', 'SAINT LUCIA', 1820, 'ACTIVE');
insert into dictionary_items values (362387869841682, 362387869841111, 'PM', '圣皮埃尔和密克隆', 'SAINT PIERRE AND MIQUELON', 1830, 'ACTIVE');
insert into dictionary_items values (362387869841683, 362387869841111, 'VC', '圣文森特和格林纳丁斯', 'SAINT VINCENT AND THE GRENADINES', 1840, 'ACTIVE');
insert into dictionary_items values (362387869841684, 362387869841111, 'WS', '萨摩亚', 'SAMOA', 1850, 'ACTIVE');
insert into dictionary_items values (362387869841685, 362387869841111, 'SM', '圣马力诺', 'SAN MARION', 1860, 'ACTIVE');
insert into dictionary_items values (362387869841686, 362387869841111, 'St', '圣多美和普林西比', 'SAO TOME AND PRINCIPE', 1870, 'ACTIVE');
insert into dictionary_items values (362387869841687, 362387869841111, 'SA', '沙特阿拉伯', 'SAUDI ARABIA', 1880, 'ACTIVE');
insert into dictionary_items values (362387869841688, 362387869841111, 'SN', '塞内加尔', 'SENEGAL', 1890, 'ACTIVE');
insert into dictionary_items values (362387869841689, 362387869841111, 'SC', '塞舌尔', 'SEYCHELLS', 1900, 'ACTIVE');
insert into dictionary_items values (362387869841690, 362387869841111, 'SL', '塞拉利昂', 'SIERRA LEONE', 1910, 'ACTIVE');
insert into dictionary_items values (362387869841691, 362387869841111, 'SG', '新加坡', 'SINGAPORE', 1920, 'ACTIVE');
insert into dictionary_items values (362387869841692, 362387869841111, 'SK', '斯洛伐克', 'SLOVAKIA', 1930, 'ACTIVE');
insert into dictionary_items values (362387869841693, 362387869841111, 'SI', '斯洛文尼亚', 'SLOVENIA', 1940, 'ACTIVE');
insert into dictionary_items values (362387869841694, 362387869841111, 'SB', '所罗门群岛', 'SOLOMON ISLANDS', 1950, 'ACTIVE');
insert into dictionary_items values (362387869841695, 362387869841111, 'SO', '索马里', 'SOMALIA', 1960, 'ACTIVE');
insert into dictionary_items values (362387869841696, 362387869841111, 'ZA', '南非', 'SOUTH AFRICA', 1970, 'ACTIVE');
insert into dictionary_items values (362387869841697, 362387869841111, 'GS', '南乔治亚岛和南桑德韦奇岛', 'SOUTH GEORGIA AND SOUTH SANDWICH ISLANDS', 1980, 'ACTIVE');
insert into dictionary_items values (362387869841698, 362387869841111, 'ES', '西班牙', 'SPAIN', 1990, 'ACTIVE');
insert into dictionary_items values (362387869841699, 362387869841111, 'LK', '斯里兰卡', 'SRI LANKA', 2000, 'ACTIVE');
insert into dictionary_items values (362387869841700, 362387869841111, 'SD', '苏丹', 'SUDAN', 2010, 'ACTIVE');
insert into dictionary_items values (362387869841701, 362387869841111, 'SR', '苏里南', 'SURINAME', 2020, 'ACTIVE');
insert into dictionary_items values (362387869841702, 362387869841111, 'SJ', '斯瓦尔巴群岛', 'SVALBARD AND JAN MAYEN ISLANDS', 2030, 'ACTIVE');
insert into dictionary_items values (362387869841703, 362387869841111, 'SZ', '斯威士兰', 'SWAZILAND', 2040, 'ACTIVE');
insert into dictionary_items values (362387869841704, 362387869841111, 'SE', '瑞典', 'SWEDEN', 2050, 'ACTIVE');
insert into dictionary_items values (362387869841705, 362387869841111, 'CH', '瑞士', 'SWITZERLAND', 2060, 'ACTIVE');
insert into dictionary_items values (362387869841706, 362387869841111, 'SY', '叙利亚', 'SYRIA', 2070, 'ACTIVE');
insert into dictionary_items values (362387869841707, 362387869841111, 'TJ', '塔吉克斯坦', 'TAJIKISTAN', 2080, 'ACTIVE');
insert into dictionary_items values (362387869841708, 362387869841111, 'TZ', '坦桑尼亚', 'TANZANIA', 2090, 'ACTIVE');
insert into dictionary_items values (362387869841709, 362387869841111, 'TH', '泰国', 'THAILAND', 2100, 'ACTIVE');
insert into dictionary_items values (362387869841710, 362387869841111, 'TG', '多哥', 'TOGO', 2110, 'ACTIVE');
insert into dictionary_items values (362387869841711, 362387869841111, 'TK', '托克劳', 'TOKELAU', 2120, 'ACTIVE');
insert into dictionary_items values (362387869841712, 362387869841111, 'TO', '汤加', 'TONGA', 2130, 'ACTIVE');
insert into dictionary_items values (362387869841713, 362387869841111, 'TT', '特立尼达和多巴哥', 'TRINIDAD AND TOBAGO', 2140, 'ACTIVE');
insert into dictionary_items values (362387869841714, 362387869841111, 'TN', '突尼斯', 'TUNISIA', 2150, 'ACTIVE');
insert into dictionary_items values (362387869841715, 362387869841111, 'TR', '土耳其', 'TURKEY', 2160, 'ACTIVE');
insert into dictionary_items values (362387869841716, 362387869841111, 'TM', '土库曼斯坦', 'TURKMENISTAN', 2170, 'ACTIVE');
insert into dictionary_items values (362387869841717, 362387869841111, 'TC', '特克斯科斯群岛', 'TURKS AND CAICOS ISLANDS', 2180, 'ACTIVE');
insert into dictionary_items values (362387869841718, 362387869841111, 'TV', '图瓦卢', 'TUVALU', 2190, 'ACTIVE');
insert into dictionary_items values (362387869841719, 362387869841111, 'UG', '乌干达', 'UGANDA', 2200, 'ACTIVE');
insert into dictionary_items values (362387869841720, 362387869841111, 'UA', '乌克兰', 'UKRAINE', 2210, 'ACTIVE');
insert into dictionary_items values (362387869841721, 362387869841111, 'AE', '阿联酋', 'UNITED ARAB EMIRATES', 2220, 'ACTIVE');
insert into dictionary_items values (362387869841722, 362387869841111, 'GB', '英国', 'UNITED KINGDOM', 2230, 'ACTIVE');
insert into dictionary_items values (362387869841723, 362387869841111, 'US', '美国', 'UNITED STATES', 2240, 'ACTIVE');
insert into dictionary_items values (362387869841724, 362387869841111, 'UM', '美国本土外小岛屿', 'UNITED STATES MINOR OUTLYING ISLANDS', 2250, 'ACTIVE');
insert into dictionary_items values (362387869841725, 362387869841111, 'UY', '乌拉圭', 'URUGUAY', 2260, 'ACTIVE');
insert into dictionary_items values (362387869841726, 362387869841111, 'UZ', '乌兹别克斯坦', 'UZBEKISTAN', 2270, 'ACTIVE');
insert into dictionary_items values (362387869841727, 362387869841111, 'VU', '瓦努阿图', 'VANUATU', 2280, 'ACTIVE');
insert into dictionary_items values (362387869841728, 362387869841111, 'VA', '梵蒂冈', 'VATICAN', 2290, 'ACTIVE');
insert into dictionary_items values (362387869841729, 362387869841111, 'VE', '委内瑞拉', 'VENEZUELA', 2300, 'ACTIVE');
insert into dictionary_items values (362387869841730, 362387869841111, 'VN', '越南', 'VIET NAM', 2310, 'ACTIVE');
insert into dictionary_items values (362387869841731, 362387869841111, 'VG', '英属维尔京群岛', 'VIRGIN ISLANDS, BRITISH', 2320, 'ACTIVE');
insert into dictionary_items values (362387869841732, 362387869841111, 'VI', '美属维尔京群岛', 'VIRGIN ISLANDS,U.S.', 2330, 'ACTIVE');
insert into dictionary_items values (362387869841733, 362387869841111, 'WF', '瓦利斯和富图纳', 'WALLIS AND FUTUNA', 2340, 'ACTIVE');
insert into dictionary_items values (362387869841734, 362387869841111, 'EH', '西撒哈拉', 'WESTERN SAHARA', 2350, 'ACTIVE');
insert into dictionary_items values (362387869841735, 362387869841111, 'YE', '也门', 'YEMEN', 2360, 'ACTIVE');
insert into dictionary_items values (362387869841736, 362387869841111, 'YU', '南斯拉夫', 'YUGOSLAVIA', 2370, 'ACTIVE');
insert into dictionary_items values (362387869841737, 362387869841111, 'ZM', '赞比亚', 'ZAMBIA', 2380, 'ACTIVE');
insert into dictionary_items values (362387869841738, 362387869841111, 'ZW', '津巴布韦', 'ZIMBABWE', 2390, 'ACTIVE');

-- 民族分类代码 (PI_ETHNICITY) - 59 items
insert into dictionary_items values (362387869841800, 362387869841112, '01', '汉族', null, 10, 'ACTIVE');
insert into dictionary_items values (362387869841801, 362387869841112, '02', '蒙古族', null, 20, 'ACTIVE');
insert into dictionary_items values (362387869841802, 362387869841112, '03', '回族', null, 30, 'ACTIVE');
insert into dictionary_items values (362387869841803, 362387869841112, '04', '藏族', null, 40, 'ACTIVE');
insert into dictionary_items values (362387869841804, 362387869841112, '05', '维吾尔族', null, 50, 'ACTIVE');
insert into dictionary_items values (362387869841805, 362387869841112, '06', '苗族', null, 60, 'ACTIVE');
insert into dictionary_items values (362387869841806, 362387869841112, '07', '彝族', null, 70, 'ACTIVE');
insert into dictionary_items values (362387869841807, 362387869841112, '08', '壮族', null, 80, 'ACTIVE');
insert into dictionary_items values (362387869841808, 362387869841112, '09', '布依族', null, 90, 'ACTIVE');
insert into dictionary_items values (362387869841809, 362387869841112, '10', '朝鲜族', null, 100, 'ACTIVE');
insert into dictionary_items values (362387869841810, 362387869841112, '11', '满族', null, 110, 'ACTIVE');
insert into dictionary_items values (362387869841811, 362387869841112, '12', '侗族', null, 120, 'ACTIVE');
insert into dictionary_items values (362387869841812, 362387869841112, '13', '瑶族', null, 130, 'ACTIVE');
insert into dictionary_items values (362387869841813, 362387869841112, '14', '白族', null, 140, 'ACTIVE');
insert into dictionary_items values (362387869841814, 362387869841112, '15', '土家族', null, 150, 'ACTIVE');
insert into dictionary_items values (362387869841815, 362387869841112, '16', '哈尼族', null, 160, 'ACTIVE');
insert into dictionary_items values (362387869841816, 362387869841112, '17', '哈萨克族', null, 170, 'ACTIVE');
insert into dictionary_items values (362387869841817, 362387869841112, '18', '傣族', null, 180, 'ACTIVE');
insert into dictionary_items values (362387869841818, 362387869841112, '19', '黎族', null, 190, 'ACTIVE');
insert into dictionary_items values (362387869841819, 362387869841112, '20', '僳僳族', null, 200, 'ACTIVE');
insert into dictionary_items values (362387869841820, 362387869841112, '21', '佤族', null, 210, 'ACTIVE');
insert into dictionary_items values (362387869841821, 362387869841112, '22', '畲族', null, 220, 'ACTIVE');
insert into dictionary_items values (362387869841822, 362387869841112, '23', '高山族', null, 230, 'ACTIVE');
insert into dictionary_items values (362387869841823, 362387869841112, '24', '拉祜族', null, 240, 'ACTIVE');
insert into dictionary_items values (362387869841824, 362387869841112, '25', '水族', null, 250, 'ACTIVE');
insert into dictionary_items values (362387869841825, 362387869841112, '26', '东乡族', null, 260, 'ACTIVE');
insert into dictionary_items values (362387869841826, 362387869841112, '27', '纳西族', null, 270, 'ACTIVE');
insert into dictionary_items values (362387869841827, 362387869841112, '28', '景颇族', null, 280, 'ACTIVE');
insert into dictionary_items values (362387869841828, 362387869841112, '29', '柯尔克孜族', null, 290, 'ACTIVE');
insert into dictionary_items values (362387869841829, 362387869841112, '30', '土族', null, 300, 'ACTIVE');
insert into dictionary_items values (362387869841830, 362387869841112, '31', '达斡尔族', null, 310, 'ACTIVE');
insert into dictionary_items values (362387869841831, 362387869841112, '32', '仫佬族', null, 320, 'ACTIVE');
insert into dictionary_items values (362387869841832, 362387869841112, '33', '羌族', null, 330, 'ACTIVE');
insert into dictionary_items values (362387869841833, 362387869841112, '34', '布朗族', null, 340, 'ACTIVE');
insert into dictionary_items values (362387869841834, 362387869841112, '35', '撤拉族', null, 350, 'ACTIVE');
insert into dictionary_items values (362387869841835, 362387869841112, '36', '毛难族', null, 360, 'ACTIVE');
insert into dictionary_items values (362387869841836, 362387869841112, '37', '仡佬族', null, 370, 'ACTIVE');
insert into dictionary_items values (362387869841837, 362387869841112, '38', '锡伯族', null, 380, 'ACTIVE');
insert into dictionary_items values (362387869841838, 362387869841112, '39', '阿昌族', null, 390, 'ACTIVE');
insert into dictionary_items values (362387869841839, 362387869841112, '40', '普米族', null, 400, 'ACTIVE');
insert into dictionary_items values (362387869841840, 362387869841112, '41', '塔吉克族', null, 410, 'ACTIVE');
insert into dictionary_items values (362387869841841, 362387869841112, '42', '怒族', null, 420, 'ACTIVE');
insert into dictionary_items values (362387869841842, 362387869841112, '43', '乌孜别克族', null, 430, 'ACTIVE');
insert into dictionary_items values (362387869841843, 362387869841112, '44', '俄罗斯族', null, 440, 'ACTIVE');
insert into dictionary_items values (362387869841844, 362387869841112, '45', '鄂温克族', null, 450, 'ACTIVE');
insert into dictionary_items values (362387869841845, 362387869841112, '46', '崩龙族', null, 460, 'ACTIVE');
insert into dictionary_items values (362387869841846, 362387869841112, '47', '保安族', null, 470, 'ACTIVE');
insert into dictionary_items values (362387869841847, 362387869841112, '48', '裕固族', null, 480, 'ACTIVE');
insert into dictionary_items values (362387869841848, 362387869841112, '49', '京族', null, 490, 'ACTIVE');
insert into dictionary_items values (362387869841849, 362387869841112, '50', '塔塔尔族', null, 500, 'ACTIVE');
insert into dictionary_items values (362387869841850, 362387869841112, '51', '独龙族', null, 510, 'ACTIVE');
insert into dictionary_items values (362387869841851, 362387869841112, '52', '鄂伦春族', null, 520, 'ACTIVE');
insert into dictionary_items values (362387869841852, 362387869841112, '53', '赫哲族', null, 530, 'ACTIVE');
insert into dictionary_items values (362387869841853, 362387869841112, '54', '门巴族', null, 540, 'ACTIVE');
insert into dictionary_items values (362387869841854, 362387869841112, '55', '珞巴族', null, 550, 'ACTIVE');
insert into dictionary_items values (362387869841855, 362387869841112, '56', '基诺族', null, 560, 'ACTIVE');
insert into dictionary_items values (362387869841856, 362387869841112, '97', '其他', null, 570, 'ACTIVE');
insert into dictionary_items values (362387869841857, 362387869841112, '98', '外籍人士', null, 580, 'ACTIVE');
insert into dictionary_items values (362387869841858, 362387869841112, '99', '不详', null, 590, 'ACTIVE');

-- 文化程度代码 (PI_EDUCATION_LEVEL) - 8 items
insert into dictionary_items values (362387869841900, 362387869841109, '10', '研究生教育', null, 10, 'ACTIVE');
insert into dictionary_items values (362387869841901, 362387869841109, '20', '大学本科教育', null, 20, 'ACTIVE');
insert into dictionary_items values (362387869841902, 362387869841109, '30', '大学专科教育', null, 30, 'ACTIVE');
insert into dictionary_items values (362387869841903, 362387869841109, '40', '中等职业教育', null, 40, 'ACTIVE');
insert into dictionary_items values (362387869841904, 362387869841109, '60', '普通高级中学教育', null, 50, 'ACTIVE');
insert into dictionary_items values (362387869841905, 362387869841109, '70', '初级中学教育', null, 60, 'ACTIVE');
insert into dictionary_items values (362387869841906, 362387869841109, '80', '小学教育', null, 70, 'ACTIVE');
insert into dictionary_items values (362387869841907, 362387869841109, '90', '其他', null, 80, 'ACTIVE');

-- 从业状况分类 (PI_EMPLOYMENT_STATUS) - 13 items
insert into dictionary_items values (362387869842000, 362387869841113, '11', '国家公务员', null, 10, 'ACTIVE');
insert into dictionary_items values (362387869842001, 362387869841113, '13', '专业技术人员', null, 20, 'ACTIVE');
insert into dictionary_items values (362387869842002, 362387869841113, '17', '职员', null, 30, 'ACTIVE');
insert into dictionary_items values (362387869842003, 362387869841113, '21', '企业管理人员', null, 40, 'ACTIVE');
insert into dictionary_items values (362387869842004, 362387869841113, '24', '工人', null, 50, 'ACTIVE');
insert into dictionary_items values (362387869842005, 362387869841113, '27', '农民', null, 60, 'ACTIVE');
insert into dictionary_items values (362387869842006, 362387869841113, '31', '学生', null, 70, 'ACTIVE');
insert into dictionary_items values (362387869842007, 362387869841113, '37', '现役军人', null, 80, 'ACTIVE');
insert into dictionary_items values (362387869842008, 362387869841113, '51', '自由职业者', null, 90, 'ACTIVE');
insert into dictionary_items values (362387869842009, 362387869841113, '54', '个体经营者', null, 100, 'ACTIVE');
insert into dictionary_items values (362387869842010, 362387869841113, '70', '无业人员', null, 110, 'ACTIVE');
insert into dictionary_items values (362387869842011, 362387869841113, '80', '退（离）休人员', null, 120, 'ACTIVE');
insert into dictionary_items values (362387869842012, 362387869841113, '99', '其他', null, 130, 'ACTIVE');

-- 职业分类代码 (PI_OCCUPATION_TYPE) - 82 items
insert into dictionary_items values (362387869842100, 362387869841110, '100', '党的机关、国家机关、群众团体和社会组织、企事业单位负责人', null, 10, 'ACTIVE');
insert into dictionary_items values (362387869842101, 362387869841110, '101', '中国共产党机关负责人', null, 20, 'ACTIVE');
insert into dictionary_items values (362387869842102, 362387869841110, '102', '国家机关负责人', null, 30, 'ACTIVE');
insert into dictionary_items values (362387869842103, 362387869841110, '103', '民主党派和工商联负责人', null, 40, 'ACTIVE');
insert into dictionary_items values (362387869842104, 362387869841110, '104', '人民团体和群众团体、社会组织及其他成员组织负责人', null, 50, 'ACTIVE');
insert into dictionary_items values (362387869842105, 362387869841110, '105', '基层群众自治组织负责人', null, 60, 'ACTIVE');
insert into dictionary_items values (362387869842106, 362387869841110, '106', '企事业单位负责人', null, 70, 'ACTIVE');
insert into dictionary_items values (362387869842107, 362387869841110, '200', '专业技术人员', null, 80, 'ACTIVE');
insert into dictionary_items values (362387869842108, 362387869841110, '201', '科学研究人员', null, 90, 'ACTIVE');
insert into dictionary_items values (362387869842109, 362387869841110, '202', '工程技术人员', null, 100, 'ACTIVE');
insert into dictionary_items values (362387869842110, 362387869841110, '203', '农业技术人员', null, 110, 'ACTIVE');
insert into dictionary_items values (362387869842111, 362387869841110, '204', '飞机和船舶技术人员', null, 120, 'ACTIVE');
insert into dictionary_items values (362387869842112, 362387869841110, '205', '卫生专业技术人员', null, 130, 'ACTIVE');
insert into dictionary_items values (362387869842113, 362387869841110, '206', '经济和金融专业人员', null, 140, 'ACTIVE');
insert into dictionary_items values (362387869842114, 362387869841110, '207', '法律、社会和宗教专业人员', null, 150, 'ACTIVE');
insert into dictionary_items values (362387869842115, 362387869841110, '208', '教学人员', null, 160, 'ACTIVE');
insert into dictionary_items values (362387869842116, 362387869841110, '209', '文学艺术、体育专业人员', null, 170, 'ACTIVE');
insert into dictionary_items values (362387869842117, 362387869841110, '210', '新闻出版、文化专业人员', null, 180, 'ACTIVE');
insert into dictionary_items values (362387869842118, 362387869841110, '299', '其他专业技术人员', null, 190, 'ACTIVE');
insert into dictionary_items values (362387869842119, 362387869841110, '300', '办事人员和有关人员', null, 200, 'ACTIVE');
insert into dictionary_items values (362387869842120, 362387869841110, '301', '办事人员', null, 210, 'ACTIVE');
insert into dictionary_items values (362387869842121, 362387869841110, '302', '安全和消防人员', null, 220, 'ACTIVE');
insert into dictionary_items values (362387869842122, 362387869841110, '399', '其他办事人员和有关人员', null, 230, 'ACTIVE');
insert into dictionary_items values (362387869842123, 362387869841110, '400', '社会生产服务和生活服务人员', null, 240, 'ACTIVE');
insert into dictionary_items values (362387869842124, 362387869841110, '401', '批发与零售服务人员', null, 250, 'ACTIVE');
insert into dictionary_items values (362387869842125, 362387869841110, '402', '交通运输、仓储和邮政业服务人员', null, 260, 'ACTIVE');
insert into dictionary_items values (362387869842126, 362387869841110, '403', '住宿和餐饮服务人员', null, 270, 'ACTIVE');
insert into dictionary_items values (362387869842127, 362387869841110, '404', '信息运输、软件和信息技术服务人员', null, 280, 'ACTIVE');
insert into dictionary_items values (362387869842128, 362387869841110, '405', '金融服务人员', null, 290, 'ACTIVE');
insert into dictionary_items values (362387869842129, 362387869841110, '406', '房地产服务人员', null, 300, 'ACTIVE');
insert into dictionary_items values (362387869842130, 362387869841110, '407', '租赁和商务服务人员', null, 310, 'ACTIVE');
insert into dictionary_items values (362387869842131, 362387869841110, '408', '技术辅助服务人员', null, 320, 'ACTIVE');
insert into dictionary_items values (362387869842132, 362387869841110, '409', '水利、环境和公共设施管理服务人员', null, 330, 'ACTIVE');
insert into dictionary_items values (362387869842133, 362387869841110, '410', '居民服务人员', null, 340, 'ACTIVE');
insert into dictionary_items values (362387869842134, 362387869841110, '411', '电力、燃气及水供应服务人员', null, 350, 'ACTIVE');
insert into dictionary_items values (362387869842135, 362387869841110, '412', '修理及制作服务人员', null, 360, 'ACTIVE');
insert into dictionary_items values (362387869842136, 362387869841110, '413', '文化、体育及娱乐服务人员', null, 370, 'ACTIVE');
insert into dictionary_items values (362387869842137, 362387869841110, '414', '健康服务人员', null, 380, 'ACTIVE');
insert into dictionary_items values (362387869842138, 362387869841110, '499', '其他社会生产和生活服务人员', null, 390, 'ACTIVE');
insert into dictionary_items values (362387869842139, 362387869841110, '500', '农、林、牧、渔业生产及辅助人员', null, 400, 'ACTIVE');
insert into dictionary_items values (362387869842140, 362387869841110, '501', '农业生产人员', null, 410, 'ACTIVE');
insert into dictionary_items values (362387869842141, 362387869841110, '502', '林业生产人员', null, 420, 'ACTIVE');
insert into dictionary_items values (362387869842142, 362387869841110, '503', '畜牧业生产人员', null, 430, 'ACTIVE');
insert into dictionary_items values (362387869842143, 362387869841110, '504', '渔业生产人员', null, 440, 'ACTIVE');
insert into dictionary_items values (362387869842144, 362387869841110, '505', '农林牧渔生产辅助人员', null, 450, 'ACTIVE');
insert into dictionary_items values (362387869842145, 362387869841110, '599', '其他农、林、牧、渔、水利业生产人员', null, 460, 'ACTIVE');
insert into dictionary_items values (362387869842146, 362387869841110, '600', '生产制造及有关人员', null, 470, 'ACTIVE');
insert into dictionary_items values (362387869842147, 362387869841110, '601', '农副产品加工人员', null, 480, 'ACTIVE');
insert into dictionary_items values (362387869842148, 362387869841110, '602', '食品、饮料生产加工人员', null, 490, 'ACTIVE');
insert into dictionary_items values (362387869842149, 362387869841110, '603', '烟草及其制品加工人员', null, 500, 'ACTIVE');
insert into dictionary_items values (362387869842150, 362387869841110, '604', '纺织、针织、印染人员', null, 510, 'ACTIVE');
insert into dictionary_items values (362387869842151, 362387869841110, '605', '纺织品、服装和皮革、毛皮制品加工制作人员', null, 520, 'ACTIVE');
insert into dictionary_items values (362387869842152, 362387869841110, '606', '木材加工、家具与木制品制作人员', null, 530, 'ACTIVE');
insert into dictionary_items values (362387869842153, 362387869841110, '607', '纸及纸制品生产加工人员', null, 540, 'ACTIVE');
insert into dictionary_items values (362387869842154, 362387869841110, '608', '印刷和记录媒介复制人员', null, 550, 'ACTIVE');
insert into dictionary_items values (362387869842155, 362387869841110, '609', '文教、工美、体育和娱乐用品制作人员', null, 560, 'ACTIVE');
insert into dictionary_items values (362387869842156, 362387869841110, '610', '石油加工和炼焦、煤化工制作人员', null, 570, 'ACTIVE');
insert into dictionary_items values (362387869842157, 362387869841110, '611', '化学原料和化学制品制造人员', null, 580, 'ACTIVE');
insert into dictionary_items values (362387869842158, 362387869841110, '612', '医药制造人员', null, 590, 'ACTIVE');
insert into dictionary_items values (362387869842159, 362387869841110, '613', '化学纤维制造人员', null, 600, 'ACTIVE');
insert into dictionary_items values (362387869842160, 362387869841110, '614', '橡胶和塑料制品制造人员', null, 610, 'ACTIVE');
insert into dictionary_items values (362387869842161, 362387869841110, '615', '非金属矿物制品制造人员', null, 620, 'ACTIVE');
insert into dictionary_items values (362387869842162, 362387869841110, '616', '采矿人员', null, 630, 'ACTIVE');
insert into dictionary_items values (362387869842163, 362387869841110, '617', '金属冶炼和压延加工人员', null, 640, 'ACTIVE');
insert into dictionary_items values (362387869842164, 362387869841110, '618', '机械制造基础加工人员', null, 650, 'ACTIVE');
insert into dictionary_items values (362387869842165, 362387869841110, '619', '金属制品制造人员', null, 660, 'ACTIVE');
insert into dictionary_items values (362387869842166, 362387869841110, '620', '通用设备制造人员', null, 670, 'ACTIVE');
insert into dictionary_items values (362387869842167, 362387869841110, '621', '专用设备制造人员', null, 680, 'ACTIVE');
insert into dictionary_items values (362387869842168, 362387869841110, '622', '汽车制造人员', null, 690, 'ACTIVE');
insert into dictionary_items values (362387869842169, 362387869841110, '623', '铁路、船舶、航空设备制造人员', null, 700, 'ACTIVE');
insert into dictionary_items values (362387869842170, 362387869841110, '624', '电气机械和器材制造人员', null, 710, 'ACTIVE');
insert into dictionary_items values (362387869842171, 362387869841110, '625', '计算机、通信和其他电子设备制造人员', null, 720, 'ACTIVE');
insert into dictionary_items values (362387869842172, 362387869841110, '626', '仪器仪表制造人员', null, 730, 'ACTIVE');
insert into dictionary_items values (362387869842173, 362387869841110, '627', '废弃资源综合利用人员', null, 740, 'ACTIVE');
insert into dictionary_items values (362387869842174, 362387869841110, '628', '电力、热力、气体、水生产和输配人员', null, 750, 'ACTIVE');
insert into dictionary_items values (362387869842175, 362387869841110, '629', '建筑施工人员', null, 760, 'ACTIVE');
insert into dictionary_items values (362387869842176, 362387869841110, '630', '运输设备和通用工程机械操作人员及有关人员', null, 770, 'ACTIVE');
insert into dictionary_items values (362387869842177, 362387869841110, '631', '生产辅助人员', null, 780, 'ACTIVE');
insert into dictionary_items values (362387869842178, 362387869841110, '699', '其他生产制造及有关人员', null, 790, 'ACTIVE');
insert into dictionary_items values (362387869842179, 362387869841110, '700', '军人', null, 800, 'ACTIVE');
insert into dictionary_items values (362387869842180, 362387869841110, '800', '不便分类的其他从业人员', null, 810, 'ACTIVE');
insert into dictionary_items values (362387869842181, 362387869841110, '999', '不详', null, 820, 'ACTIVE');

-- 婚姻代码 (PI_MARITAL_STATUS) - 5 items
insert into dictionary_items values (362387869842200, 362387869841101, '1', '未婚', null, 10, 'ACTIVE');
insert into dictionary_items values (362387869842201, 362387869841101, '2', '已婚', null, 20, 'ACTIVE');
insert into dictionary_items values (362387869842202, 362387869841101, '3', '丧偶', null, 30, 'ACTIVE');
insert into dictionary_items values (362387869842203, 362387869841101, '4', '离婚', null, 40, 'ACTIVE');
insert into dictionary_items values (362387869842204, 362387869841101, '9', '其他', null, 50, 'ACTIVE');

-- 家庭关系代码 (PI_RELATED_PERSON_RELATIONSHIP) - 85 items
insert into dictionary_items values (362387869842300, 362387869841105, '0', '本人', null, 10, 'ACTIVE');
insert into dictionary_items values (362387869842301, 362387869841105, '01', '本人', null, 20, 'ACTIVE');
insert into dictionary_items values (362387869842302, 362387869841105, '02', '户主', null, 30, 'ACTIVE');
insert into dictionary_items values (362387869842303, 362387869841105, '1', '配偶', null, 40, 'ACTIVE');
insert into dictionary_items values (362387869842304, 362387869841105, '11', '夫', null, 50, 'ACTIVE');
insert into dictionary_items values (362387869842305, 362387869841105, '12', '妻', null, 60, 'ACTIVE');
insert into dictionary_items values (362387869842306, 362387869841105, '2', '子', null, 70, 'ACTIVE');
insert into dictionary_items values (362387869842307, 362387869841105, '21', '独生子', null, 80, 'ACTIVE');
insert into dictionary_items values (362387869842308, 362387869841105, '22', '长子', null, 90, 'ACTIVE');
insert into dictionary_items values (362387869842309, 362387869841105, '23', '次子', null, 100, 'ACTIVE');
insert into dictionary_items values (362387869842310, 362387869841105, '24', '三子', null, 110, 'ACTIVE');
insert into dictionary_items values (362387869842311, 362387869841105, '25', '四子', null, 120, 'ACTIVE');
insert into dictionary_items values (362387869842312, 362387869841105, '26', '五子', null, 130, 'ACTIVE');
insert into dictionary_items values (362387869842313, 362387869841105, '27', '养子或继子', null, 140, 'ACTIVE');
insert into dictionary_items values (362387869842314, 362387869841105, '28', '女婿', null, 150, 'ACTIVE');
insert into dictionary_items values (362387869842315, 362387869841105, '29', '其他儿子', null, 160, 'ACTIVE');
insert into dictionary_items values (362387869842316, 362387869841105, '3', '女', null, 170, 'ACTIVE');
insert into dictionary_items values (362387869842317, 362387869841105, '31', '独生女', null, 180, 'ACTIVE');
insert into dictionary_items values (362387869842318, 362387869841105, '32', '长女', null, 190, 'ACTIVE');
insert into dictionary_items values (362387869842319, 362387869841105, '33', '次女', null, 200, 'ACTIVE');
insert into dictionary_items values (362387869842320, 362387869841105, '34', '三女', null, 210, 'ACTIVE');
insert into dictionary_items values (362387869842321, 362387869841105, '35', '四女', null, 220, 'ACTIVE');
insert into dictionary_items values (362387869842322, 362387869841105, '36', '五女', null, 230, 'ACTIVE');
insert into dictionary_items values (362387869842323, 362387869841105, '37', '养女或继女', null, 240, 'ACTIVE');
insert into dictionary_items values (362387869842324, 362387869841105, '38', '儿媳', null, 250, 'ACTIVE');
insert into dictionary_items values (362387869842325, 362387869841105, '39', '其他女儿', null, 260, 'ACTIVE');
insert into dictionary_items values (362387869842326, 362387869841105, '4', '孙子、孙女或外孙子、外孙女', null, 270, 'ACTIVE');
insert into dictionary_items values (362387869842327, 362387869841105, '41', '孙子', null, 280, 'ACTIVE');
insert into dictionary_items values (362387869842328, 362387869841105, '42', '孙女', null, 290, 'ACTIVE');
insert into dictionary_items values (362387869842329, 362387869841105, '43', '外孙子', null, 300, 'ACTIVE');
insert into dictionary_items values (362387869842330, 362387869841105, '44', '外孙女', null, 310, 'ACTIVE');
insert into dictionary_items values (362387869842331, 362387869841105, '45', '孙媳妇', null, 320, 'ACTIVE');
insert into dictionary_items values (362387869842332, 362387869841105, '46', '孙女婿', null, 330, 'ACTIVE');
insert into dictionary_items values (362387869842333, 362387869841105, '47', '曾孙子或外曾孙子', null, 340, 'ACTIVE');
insert into dictionary_items values (362387869842334, 362387869841105, '48', '曾孙女或外曾孙女', null, 350, 'ACTIVE');
insert into dictionary_items values (362387869842335, 362387869841105, '49', '其他孙子、孙女或外孙子、外孙女', null, 360, 'ACTIVE');
insert into dictionary_items values (362387869842336, 362387869841105, '5', '父母', null, 370, 'ACTIVE');
insert into dictionary_items values (362387869842337, 362387869841105, '51', '父亲', null, 380, 'ACTIVE');
insert into dictionary_items values (362387869842338, 362387869841105, '52', '母亲', null, 390, 'ACTIVE');
insert into dictionary_items values (362387869842339, 362387869841105, '53', '公公', null, 400, 'ACTIVE');
insert into dictionary_items values (362387869842340, 362387869841105, '54', '婆婆', null, 410, 'ACTIVE');
insert into dictionary_items values (362387869842341, 362387869841105, '55', '岳父', null, 420, 'ACTIVE');
insert into dictionary_items values (362387869842342, 362387869841105, '56', '岳母', null, 430, 'ACTIVE');
insert into dictionary_items values (362387869842343, 362387869841105, '57', '继父或养父', null, 440, 'ACTIVE');
insert into dictionary_items values (362387869842344, 362387869841105, '58', '继母或养母', null, 450, 'ACTIVE');
insert into dictionary_items values (362387869842345, 362387869841105, '59', '其他父母关系', null, 460, 'ACTIVE');
insert into dictionary_items values (362387869842346, 362387869841105, '6', '祖父母或外祖父母', null, 470, 'ACTIVE');
insert into dictionary_items values (362387869842347, 362387869841105, '61', '祖父', null, 480, 'ACTIVE');
insert into dictionary_items values (362387869842348, 362387869841105, '62', '祖母', null, 490, 'ACTIVE');
insert into dictionary_items values (362387869842349, 362387869841105, '63', '外祖父', null, 500, 'ACTIVE');
insert into dictionary_items values (362387869842350, 362387869841105, '64', '外祖母', null, 510, 'ACTIVE');
insert into dictionary_items values (362387869842351, 362387869841105, '65', '配偶的祖父母或外祖父母', null, 520, 'ACTIVE');
insert into dictionary_items values (362387869842352, 362387869841105, '66', '曾祖父', null, 530, 'ACTIVE');
insert into dictionary_items values (362387869842353, 362387869841105, '67', '曾祖母', null, 540, 'ACTIVE');
insert into dictionary_items values (362387869842354, 362387869841105, '68', '配偶的曾祖父母或外曾祖父母', null, 550, 'ACTIVE');
insert into dictionary_items values (362387869842355, 362387869841105, '69', '其他祖父母或外祖父母', null, 560, 'ACTIVE');
insert into dictionary_items values (362387869842356, 362387869841105, '7', '兄、弟、姐、妹', null, 570, 'ACTIVE');
insert into dictionary_items values (362387869842357, 362387869841105, '71', '兄', null, 580, 'ACTIVE');
insert into dictionary_items values (362387869842358, 362387869841105, '72', '嫂', null, 590, 'ACTIVE');
insert into dictionary_items values (362387869842359, 362387869841105, '73', '弟', null, 600, 'ACTIVE');
insert into dictionary_items values (362387869842360, 362387869841105, '74', '弟媳', null, 610, 'ACTIVE');
insert into dictionary_items values (362387869842361, 362387869841105, '75', '姐姐', null, 620, 'ACTIVE');
insert into dictionary_items values (362387869842362, 362387869841105, '76', '姐夫', null, 630, 'ACTIVE');
insert into dictionary_items values (362387869842363, 362387869841105, '77', '妹妹', null, 640, 'ACTIVE');
insert into dictionary_items values (362387869842364, 362387869841105, '78', '妹夫', null, 650, 'ACTIVE');
insert into dictionary_items values (362387869842365, 362387869841105, '79', '其他兄弟姐妹', null, 660, 'ACTIVE');
insert into dictionary_items values (362387869842366, 362387869841105, '8', '其他', null, 670, 'ACTIVE');
insert into dictionary_items values (362387869842367, 362387869841105, '81', '伯父', null, 680, 'ACTIVE');
insert into dictionary_items values (362387869842368, 362387869841105, '82', '伯母', null, 690, 'ACTIVE');
insert into dictionary_items values (362387869842369, 362387869841105, '83', '叔父', null, 700, 'ACTIVE');
insert into dictionary_items values (362387869842370, 362387869841105, '84', '婶母', null, 710, 'ACTIVE');
insert into dictionary_items values (362387869842371, 362387869841105, '85', '舅父', null, 720, 'ACTIVE');
insert into dictionary_items values (362387869842372, 362387869841105, '86', '舅母', null, 730, 'ACTIVE');
insert into dictionary_items values (362387869842373, 362387869841105, '87', '姨父', null, 740, 'ACTIVE');
insert into dictionary_items values (362387869842374, 362387869841105, '88', '姨母', null, 750, 'ACTIVE');
insert into dictionary_items values (362387869842375, 362387869841105, '89', '姑父', null, 760, 'ACTIVE');
insert into dictionary_items values (362387869842376, 362387869841105, '90', '姑母', null, 770, 'ACTIVE');
insert into dictionary_items values (362387869842377, 362387869841105, '91', '堂兄弟', null, 780, 'ACTIVE');
insert into dictionary_items values (362387869842378, 362387869841105, '92', '表兄弟', null, 790, 'ACTIVE');
insert into dictionary_items values (362387869842379, 362387869841105, '93', '侄子', null, 800, 'ACTIVE');
insert into dictionary_items values (362387869842380, 362387869841105, '94', '侄女', null, 810, 'ACTIVE');
insert into dictionary_items values (362387869842381, 362387869841105, '95', '外甥', null, 820, 'ACTIVE');
insert into dictionary_items values (362387869842382, 362387869841105, '96', '外甥女', null, 830, 'ACTIVE');
insert into dictionary_items values (362387869842383, 362387869841105, '97', '其他亲属', null, 840, 'ACTIVE');
insert into dictionary_items values (362387869842384, 362387869841105, '99', '非亲属', null, 850, 'ACTIVE');

-- 医疗费用类别代码 (INS_COVERAGE_TYPE) - 15 items
insert into dictionary_items values (362387869842400, 362387869841106, '01', '城镇职工基本医疗保险', null, 10, 'ACTIVE');
insert into dictionary_items values (362387869842401, 362387869841106, '0101', '本市城镇职工基本医疗保险', null, 20, 'ACTIVE');
insert into dictionary_items values (362387869842402, 362387869841106, '0102', '外埠城镇职工基本医疗保险', null, 30, 'ACTIVE');
insert into dictionary_items values (362387869842403, 362387869841106, '02', '城镇居民基本医疗保险', null, 40, 'ACTIVE');
insert into dictionary_items values (362387869842404, 362387869841106, '0201', '本市城乡居民基本医疗保险', null, 50, 'ACTIVE');
insert into dictionary_items values (362387869842405, 362387869841106, '0202', '外埠城镇居民基本医疗保险', null, 60, 'ACTIVE');
insert into dictionary_items values (362387869842406, 362387869841106, '03', '新型农村合作医疗', null, 70, 'ACTIVE');
insert into dictionary_items values (362387869842407, 362387869841106, '0301', '本市新型农村合作医疗', null, 80, 'ACTIVE');
insert into dictionary_items values (362387869842408, 362387869841106, '0302', '外埠新型农村合作医疗', null, 90, 'ACTIVE');
insert into dictionary_items values (362387869842409, 362387869841106, '04', '贫困救助', null, 100, 'ACTIVE');
insert into dictionary_items values (362387869842410, 362387869841106, '05', '商业医疗保险', null, 110, 'ACTIVE');
insert into dictionary_items values (362387869842411, 362387869841106, '06', '全公费', null, 120, 'ACTIVE');
insert into dictionary_items values (362387869842412, 362387869841106, '07', '全自费', null, 130, 'ACTIVE');
insert into dictionary_items values (362387869842413, 362387869841106, '08', '其他社会保险', null, 140, 'ACTIVE');
insert into dictionary_items values (362387869842414, 362387869841106, '99', '其他', null, 150, 'ACTIVE');

-- 4. Migrate Existing Data to Standard Codes

-- Identifiers
update resident_identifiers set identifier_system = '1' where identifier_system in ('NATIONAL_ID', 'SOCIAL_SECURITY_CARD', 'HEALTH_CARD', 'MEDICAL_INSURANCE_NO');
update resident_identifiers set identifier_system = '6' where identifier_system = 'PASSPORT';
update resident_identifiers set identifier_system = '9' where identifier_system in ('OTHER', 'BIRTH_CERTIFICATE', 'HOSPITAL_MRN');

-- Demographics
update resident_demographic_profiles set nationality_code = 'CN' where nationality_code in ('156', 'CHN') or nationality_code is null;
update resident_demographic_profiles set ethnicity_code = '01' where ethnicity_code in ('1', '01') or ethnicity_code is null;

update resident_demographic_profiles set marital_status_code = '1' where marital_status_code in ('UNMARRIED', 'SINGLE');
update resident_demographic_profiles set marital_status_code = '2' where marital_status_code in ('MARRIED');
update resident_demographic_profiles set marital_status_code = '3' where marital_status_code in ('WIDOWED');
update resident_demographic_profiles set marital_status_code = '4' where marital_status_code in ('DIVORCED');
update resident_demographic_profiles set marital_status_code = '9' where marital_status_code in ('UNKNOWN', 'OTHER');

update resident_demographic_profiles set education_code = '10' where education_code in ('POSTGRADUATE', 'MASTER', 'DOCTOR');
update resident_demographic_profiles set education_code = '20' where education_code in ('BACHELOR');
update resident_demographic_profiles set education_code = '30' where education_code in ('COLLEGE');
update resident_demographic_profiles set education_code = '40' where education_code in ('TECHNICAL');
update resident_demographic_profiles set education_code = '60' where education_code in ('SENIOR_HIGH', 'HIGH_SCHOOL');
update resident_demographic_profiles set education_code = '70' where education_code in ('JUNIOR_HIGH');
update resident_demographic_profiles set education_code = '80' where education_code in ('PRIMARY');
update resident_demographic_profiles set education_code = '90' where education_code in ('NONE', 'UNKNOWN', 'OTHER');

update resident_demographic_profiles set occupation_code = '800' where occupation_code in ('RETIRED', 'STUDENT', 'UNEMPLOYED');
update resident_demographic_profiles set occupation_code = '200' where occupation_code in ('PROFESSIONAL');
update resident_demographic_profiles set occupation_code = '600' where occupation_code in ('WORKER');
update resident_demographic_profiles set occupation_code = '500' where occupation_code in ('AGRICULTURE');
update resident_demographic_profiles set occupation_code = '400' where occupation_code in ('SERVICE');
update resident_demographic_profiles set occupation_code = '300' where occupation_code in ('OFFICE');
update resident_demographic_profiles set occupation_code = '999' where occupation_code in ('UNKNOWN', 'OTHER');

-- Related Persons
update resident_related_persons set relationship_code = '1' where relationship_code in ('SPOUSE');
update resident_related_persons set relationship_code = '2' where relationship_code in ('CHILD');
update resident_related_persons set relationship_code = '5' where relationship_code in ('PARENT');
update resident_related_persons set relationship_code = '02' where relationship_code in ('GUARDIAN');
update resident_related_persons set relationship_code = '97' where relationship_code in ('OTHER');

-- Coverages
update resident_coverages set coverage_type_code = '01' where coverage_type_code in ('EMPLOYEE_BASIC');
update resident_coverages set coverage_type_code = '02' where coverage_type_code in ('RESIDENT_BASIC');
update resident_coverages set coverage_type_code = '05' where coverage_type_code in ('COMMERCIAL');
update resident_coverages set coverage_type_code = '07' where coverage_type_code in ('SELF_PAY');
update resident_coverages set coverage_type_code = '99' where coverage_type_code in ('OTHER');
