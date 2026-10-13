-- The limit check and INCR must run atomically on the same Redis key.
local raw = redis.call('GET', KEYS[1])
local maximum = tonumber(ARGV[1])
if raw and (not string.match(raw, '^%d+$') or #raw > 12) then
    return redis.error_reply('Invalid business number counter')
end
local current = raw and tonumber(raw) or 0
local minimum = tonumber(ARGV[2] or '0')
if minimum > current then
    if minimum >= maximum then return -1 end
    redis.call('SET', KEYS[1], string.format('%.0f', minimum))
    current = minimum
end
if current >= maximum then return -1 end
-- No expiry: a delayed request / clock correction must not recreate an old day's sequence.
return redis.call('INCR', KEYS[1])
