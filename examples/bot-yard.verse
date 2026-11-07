# BOT YARD · state changes what happens next
PointsPerHit:int = 25
HitsToWin:int = 4

island := class(creative_device):
    var Hits:int = 0

    OnBegin<override>():void =
        World("Bot Yard")
        PlayerSpawn(0, 1500, 0)
        Prop("yard", "floor", 0, 0, 0, 2400, 2400, 15, "sand")
        for (I := 1..3):
            Prop("target{I}", "target", (I - 2) * 650, -650, 0, 100, 100, 280, "coral")
        Prop("cover", "crate", -900, 250, 0, 200, 200, 200, "wood")
        Bot("Dash", -600, -100, 0, "patrol")
        Bot("Echo", 700, -400, 0, "wander")
        Button("reset", 850, 900, 0, "Reset hit counter")
        Message("Aim at bots or targets and click to fire. Every hit runs Verse.")

    OnEvent<override>(Event:string):void =
        if (Event = "hit:Dash" or Event = "hit:Echo" or Event = "hit:target1" or Event = "hit:target2" or Event = "hit:target3"):
            Trace(23, "hit event → counter + condition")
            set Hits += 1
            Score(PointsPerHit)
            Message("Hit {Hits}/{HitsToWin}. This counter lives in Verse.")
            if (Hits >= HitsToWin):
                Finish("Practice complete! The victory condition is yours to edit.")
        if (Event = "interact:reset"):
            set Hits = 0
            Message("Counter reset. Take another shot.")
