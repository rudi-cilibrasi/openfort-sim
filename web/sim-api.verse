# Overfort simulator API. Integer coordinates/sizes are centimeters.
# This is a teaching API, not Epic's Fortnite device SDK.
OFEvents():[]string = array{}
creative_device := class:
    OnBegin():void = {}
    OnEvent(Event:string):void = {}
World(Name:string):void = Print("@of\tworld\t{Name}")
PlayerSpawn(X:int, Y:int, Z:int):void = Print("@of\tspawn\t{X}\t{Y}\t{Z}")
Prop(Id:string, Kind:string, X:int, Y:int, Z:int, W:int, D:int, H:int, Color:string):void =
    Print("@of\tprop\t{Id}\t{Kind}\t{X}\t{Y}\t{Z}\t{W}\t{D}\t{H}\t{Color}")
Button(Id:string, X:int, Y:int, Z:int, Label:string):void = Print("@of\tbutton\t{Id}\t{X}\t{Y}\t{Z}\t{Label}")
Trigger(Id:string, X:int, Y:int, Z:int, Radius:int):void = Print("@of\ttrigger\t{Id}\t{X}\t{Y}\t{Z}\t{Radius}")
Pickup(Id:string, X:int, Y:int, Z:int):void = Print("@of\tpickup\t{Id}\t{X}\t{Y}\t{Z}")
Bot(Id:string, X:int, Y:int, Z:int, Behavior:string):void = Print("@of\tbot\t{Id}\t{X}\t{Y}\t{Z}\t{Behavior}")
Hide(Id:string):void = Print("@of\thide\t{Id}")
Show(Id:string):void = Print("@of\tshow\t{Id}")
MoveTo(Id:string, X:int, Y:int, Z:int, Milliseconds:int):void = Print("@of\tmove\t{Id}\t{X}\t{Y}\t{Z}\t{Milliseconds}")
SetColor(Id:string, Color:string):void = Print("@of\tcolor\t{Id}\t{Color}")
Score(Points:int):void = Print("@of\tscore\t{Points}")
Message(Text:string):void = Print("@of\tmessage\t{Text}")
TeleportPlayer(X:int, Y:int, Z:int):void = Print("@of\tteleport\t{X}\t{Y}\t{Z}")
LaunchPlayer(Strength:int):void = Print("@of\tlaunch\t{Strength}")
Finish(Text:string):void = Print("@of\tfinish\t{Text}")
Trace(Line:int, Label:string):void = Print("@of\ttrace\t{Line}\t{Label}")
