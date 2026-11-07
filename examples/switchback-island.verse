# SWITCHBACK ISLAND · a first device experiment
# Coordinates and dimensions are integer centimeters.
# Change these values, compile, and explore the result.
GateHeight:int = 420
Reward:int = 100

island := class(creative_device):
    var Open:logic = false

    OnBegin<override>():void =
        World("Switchback Island")
        PlayerSpawn(0, 1300, 0)
        Prop("courtyard", "floor", 0, 0, 0, 1600, 2200, 20, "sand")
        Prop("gate", "wall", 0, -350, 0, 720, 65, GateHeight, "cyan")
        Prop("left", "tower", -570, -350, 0, 350, 350, 600, "stone")
        Prop("right", "tower", 570, -350, 0, 350, 350, 600, "stone")
        Prop("cabin", "house", -1500, -500, 0, 650, 650, 500, "coral")
        Prop("crate", "crate", 1000, 500, 0, 150, 150, 150, "wood")
        Button("switch", 0, 450, 0, "Open the gate")
        Trigger("garden", 0, -1000, 0, 320)
        Pickup("crystal", 0, -1200, 100)
        Bot("Scout", 1050, -800, 0, "patrol")
        Message("Find the amber switch. Press E to interact.")

    OnEvent<override>(Event:string):void =
        if (Event = "interact:switch"):
            Trace(29, "OnEvent → interact:switch")
            if (not Open?):
                set Open = true
                MoveTo("gate", 0, -350, GateHeight + 40, 1200)
                Score(Reward)
                Message("Gate open! Step into the garden.")
            else:
                Message("The gate is already open. Try changing the code.")
        if (Event = "enter:garden"):
            Trace(37, "OnEvent → enter:garden")
            Message("You reached the garden.")
        if (Event = "collect:crystal"):
            Hide("crystal")
            Score(50)
            Finish("Island explored. Now make it your own!")
