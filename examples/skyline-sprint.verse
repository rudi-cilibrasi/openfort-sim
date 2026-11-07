# SKYLINE SPRINT · loops build the world
Steps:int = 6
JumpPower:int = 2200

island := class(creative_device):
    OnBegin<override>():void =
        World("Skyline Sprint")
        PlayerSpawn(0, 1400, 0)
        Prop("start", "floor", 0, 1000, 0, 1200, 900, 20, "sand")
        for (I := 1..Steps):
            Prop("step{I}", "floor", 0, 750 - I * 240, I * 65, 500, 260, 45, "cyan")
        Prop("landing", "floor", 0, -650, 600, 1400, 850, 90, "violet")
        Prop("tree", "tree", -900, 800, 0, 350, 350, 650, "grass")
        Trigger("launch", 0, 500, 0, 210)
        Trigger("finish", 0, -650, 690, 300)
        Pickup("star", 0, -650, 800)
        Message("Enter the purple launch ring, then steer toward the high platform.")

    OnEvent<override>(Event:string):void =
        if (Event = "enter:launch"):
            Trace(20, "enter:launch → LaunchPlayer")
            LaunchPlayer(JumpPower)
            Message("Up you go! Try a different JumpPower.")
        if (Event = "enter:finish"):
            Trace(26, "enter:finish → Score")
            Score(100)
            Message("You landed on a Verse-generated platform.")
        if (Event = "collect:star"):
            Hide("star")
            Finish("Course complete. Change Steps and try again!")
