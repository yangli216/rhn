create table grid_address_nodes (
    id number(19,0) primary key,
    revision number(19,0) default 0 not null,
    parent_id number(19,0),
    level_code varchar2(16 char) not null,
    code varchar2(12 char) not null,
    name varchar2(120 char) not null,
    short_name varchar2(120 char),
    pinyin_code varchar2(64 char) not null,
    full_path varchar2(500 char) not null,
    sort_order number(10,0) default 0 not null,
    status varchar2(16 char) default 'ACTIVE' not null,
    system_managed number(1,0) default 0 not null,
    created_at timestamp with time zone not null,
    created_by number(19,0),
    updated_at timestamp with time zone not null,
    updated_by number(19,0),
    constraint fk_grid_address_parent foreign key (parent_id) references grid_address_nodes(id),
    constraint uk_grid_address_code unique (code),
    constraint uk_grid_address_parent_name unique (parent_id, name),
    constraint ck_grid_address_level check (level_code in ('PROVINCE', 'CITY', 'COUNTY', 'STREET', 'COMMUNITY')),
    constraint ck_grid_address_status check (status in ('ACTIVE', 'INACTIVE')),
    constraint ck_grid_address_code_length check (length(code) = 12),
    constraint ck_grid_address_sort check (sort_order >= 0),
    constraint ck_grid_address_parent_self check (parent_id is null or parent_id <> id)
);

create index idx_grid_address_parent on grid_address_nodes(parent_id, sort_order, code);
create index idx_grid_address_search on grid_address_nodes(status, level_code, pinyin_code);

alter table resident_addresses add (community_code varchar2(12 char));

insert all
    into grid_address_nodes values (362387869850000,0,null,'PROVINCE','320000000000','江苏省','江苏','JSS','江苏省',10,'ACTIVE',1,current_timestamp,null,current_timestamp,null)
    into grid_address_nodes values (362387869850001,0,362387869850000,'CITY','320100000000','南京市','南京','NJS','江苏省/南京市',10,'ACTIVE',1,current_timestamp,null,current_timestamp,null)
    into grid_address_nodes values (362387869850002,0,362387869850001,'COUNTY','320115000000','江宁区','江宁','JNQ','江苏省/南京市/江宁区',10,'ACTIVE',1,current_timestamp,null,current_timestamp,null)
    into grid_address_nodes values (362387869850003,0,362387869850002,'STREET','320115002000','秣陵街道','秣陵','MLJD','江苏省/南京市/江宁区/秣陵街道',10,'ACTIVE',1,current_timestamp,null,current_timestamp,null)
    into grid_address_nodes values (362387869850004,0,362387869850003,'COMMUNITY','320115002001','青禾社区','青禾','QHSQ','江苏省/南京市/江宁区/秣陵街道/青禾社区',10,'ACTIVE',1,current_timestamp,null,current_timestamp,null)
    into grid_address_nodes values (362387869850005,0,362387869850003,'COMMUNITY','320115002002','百家湖社区','百家湖','BJHSQ','江苏省/南京市/江宁区/秣陵街道/百家湖社区',20,'ACTIVE',1,current_timestamp,null,current_timestamp,null)
    into grid_address_nodes values (362387869850006,0,362387869850001,'COUNTY','320111000000','浦口区','浦口','PKQ','江苏省/南京市/浦口区',20,'ACTIVE',1,current_timestamp,null,current_timestamp,null)
    into grid_address_nodes values (362387869850007,0,362387869850006,'STREET','320111004000','江浦街道','江浦','JPJD','江苏省/南京市/浦口区/江浦街道',10,'ACTIVE',1,current_timestamp,null,current_timestamp,null)
    into grid_address_nodes values (362387869850008,0,362387869850007,'COMMUNITY','320111004001','新河社区','新河','XHSQ','江苏省/南京市/浦口区/江浦街道/新河社区',10,'ACTIVE',1,current_timestamp,null,current_timestamp,null)
    into grid_address_nodes values (362387869850009,0,null,'PROVINCE','330000000000','浙江省','浙江','ZJS','浙江省',20,'ACTIVE',1,current_timestamp,null,current_timestamp,null)
    into grid_address_nodes values (362387869850010,0,362387869850009,'CITY','330100000000','杭州市','杭州','HZS','浙江省/杭州市',10,'ACTIVE',1,current_timestamp,null,current_timestamp,null)
    into grid_address_nodes values (362387869850011,0,362387869850010,'COUNTY','330106000000','西湖区','西湖','XHQ','浙江省/杭州市/西湖区',10,'ACTIVE',1,current_timestamp,null,current_timestamp,null)
    into grid_address_nodes values (362387869850012,0,362387869850011,'STREET','330106002000','北山街道','北山','BSJD','浙江省/杭州市/西湖区/北山街道',10,'ACTIVE',1,current_timestamp,null,current_timestamp,null)
    into grid_address_nodes values (362387869850013,0,362387869850012,'COMMUNITY','330106002001','栖霞岭社区','栖霞岭','QXLSQ','浙江省/杭州市/西湖区/北山街道/栖霞岭社区',10,'ACTIVE',1,current_timestamp,null,current_timestamp,null)
select 1 from dual;
