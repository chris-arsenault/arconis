/** Front elevation and an independent detail of the same rail. Dimensions are in shop units. */
export const BOOKSHELF = `woodworking on
scale 12 represents 1 "in"
part top panel name "Bookshelf top" material "Plywood" thickness "3/4 in" width "16 in" length "48 in"
part left_post board name "Left upright" stock "2x4" occupies "width" inset "0 in"
part right_post board name "Right upright" stock "2x4" occupies "width" inset "0 in"
part rail board name "Crossbeam" stock "2x4" span "top" span-axis "length" left "left_post" right "right_post"
part corner joint name "Left rail joint" type "butt" through "rail" into "left_post"
part fixing screw name "Left screw" gauge "#12" joint "corner" clearance "3/16 in" pilot "1/8 in" face "wide face" end "A" offset "1 in"
part shelf_load load name "Books" member "rail" face "top edge" end "A" offset "12 in" direction "down"
part floor support name "Floor under left post" member "left_post" face "end B" type "floor contact"
frame elevation "Front elevation" at 0,0 {
  node top_view "Top" depicts top edge at 40,60
  node left_view "Left upright" depicts left_post face rotate 90 at 13,96
  node right_view "Right upright" depicts right_post face rotate 90 at 547,96
  node rail_view "Crossbeam" depicts rail face at 82,69
  rail_view.left -> left_view.top "Left screw" as screw_callout depicts fixing face
  node load_view "Books ↓" depicts shelf_load face at 174,145
  load_view -> rail_view "Applied to"
  node floor_view "Floor" depicts floor face at 20,250
  left_view -> floor_view "Bears on"
}
frame detail "Joint detail" at 750,0 {
  node rail_end "Crossbeam end" depicts rail end at 775,70
  node left_end "Left upright" depicts left_post end at 910,70
  rail_end -> left_end "#12 screw" as screw_detail depicts fixing edge
}`;
