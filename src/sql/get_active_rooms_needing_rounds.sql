-- use postgres
-- drop function if exists get_active_rooms_needing_rounds();

CREATE OR REPLACE FUNCTION get_active_rooms_needing_rounds()
RETURNS TABLE(id int, active boolean, contract_address text, chain_id int, room_config jsonb) AS $$
BEGIN
    RETURN QUERY

    SELECT rooms.id, rooms.active, rooms.contract_address, rooms.chain_id, rooms.room_config
    FROM   rooms
    WHERE  rooms.active = true
           and rooms.contract_address is not null
           and (
                not exists (
                    select  1
                    from    rounds
                    where   rounds.room_id = rooms.id
                            and rounds.active = true
                 )
                or exists (
                    select 1
                    from   rounds
                    where  rounds.room_id = rooms.id
                            and rounds.active = true
                            and rounds.status = 'STARTING'
                            and rounds.updated_at < NOW() - INTERVAL '30 seconds'
                )
           );
END;
$$ LANGUAGE plpgsql;


