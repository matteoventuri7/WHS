function clean_ansi(tag, timestamp, record)
    if record["log"] ~= nil then
        record["log"] = record["log"]:gsub("\27%[[0-9;]*[a-zA-Z]", "")
    end
    return 1, timestamp, record
end
