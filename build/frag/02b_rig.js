  // ============================================================
  // CHARACTER RIG — one soft bean, small stubby limbs
  // ============================================================
  // Body and head are a single piece: no neck, no separate skull. The silhouette
  // is a lathed bean — rounded top, widest low down, rounded base — rather than a
  // plain scaled sphere, which reads as an egg. Limbs are deliberately small: an
  // arm that reaches past the body's waist looks like a growth, not a limb.
  // The whole figure still occupies the 34-unit box the old sphere did, so the
  // physics (RADIUS = 17) is untouched.
  // v22: shorter, wider, and top-heavy. v20 stretched the bean to 1.9 : 1,
  // which reads as a tall oval with a face painted halfway down it -- the
  // silhouette had no head. This one is built the other way round: a big
  // rounded head that is the widest part of the figure, a waist pinched in
  // under it, a short chunky body, and stubby legs on big feet. It stands
  // about 1.45 : 1. The collision sphere is untouched at RADIUS = 17, so
  // nothing in the simulation moves; this is the silhouette only.
  //
  // v24 §1: SKINNED. The shape is unchanged; what changed is how it is drawn.
  // The old rig was twenty-odd separate meshes hung off nested Groups, which
  // cost about thirteen and a half draw calls a racer. Sixteen racers made that
  // 216 draws and v21 recorded "one skinned mesh per racer" as the fix; at
  // twenty-four racers it is no longer optional, because the field alone was
  // over the 300-call budget for the whole frame.
  //
  // So every part is baked into one buffer and bound rigidly -- weight 1 -- to
  // a bone standing where its Group used to stand. Bones are Object3D, so the
  // animation code sets `legPivots[0].rotation.x` exactly as it did before and
  // does not know the difference. Two meshes come out rather than one: the bean
  // keeps the skin material with all its patterns, rim light and shader work,
  // and everything else -- limbs, face, eyes, hat -- shares one plastic
  // material and carries its colour in the vertices. Two draws a racer.
  // v24 §6: THE FACE IS A CAP ON THE HEAD, NOT A DISC INSIDE IT.
  //
  // v22 widened the head bulge to maxR 12.4 at y 8.6 and the face kept v20's
  // placement -- faceZ 6.8 with a plate squashed to 0.52 in z, so the plate's
  // front sat at z 10.96 against a skin at radius 12.29. It was 1.33 units
  // UNDER the surface: a plain pink head with two dots grazing it, which is
  // what the lobby actually showed. Pushing faceZ out on its own does not fix
  // that, it only floats the middle of a flat disc off a round head and leaves
  // the edges hanging in the air.
  //
  // So the plate is now a SPHERICAL CAP concentric with the head, of radius
  // (head radius at faceY + facePROUD). Every point on it is therefore the same
  // small distance off a curved surface -- it hugs the head by construction
  // rather than by a number somebody tuned -- and the cap's angular size is
  // derived from the width and height the face is supposed to have.
  // v25 §1: THE ATHLETIC PASS. The silhouette the reference study argued for is
  // not a rounder bean, it is a bean with JOINTS. Three numbers moved and the
  // rest follows from them:
  //
  //   * narrower. maxR 12.4 -> 12.0, and the stance grew, which takes the
  //     crown-to-sole ratio from 1.38 : 1 to 1.49 : 1 measured. Check 5 allows
  //     1.30-1.55, so this is the athletic end of the band the game already
  //     agreed to rather than a new licence to be tall.
  //   * a real waist. The pinch went from 10.8 to 9.5, so the head reads as a
  //     head against something narrower instead of against a barely-dented
  //     column, and there is a place for a belt to sit.
  //   * a shoulder shelf at 5.4, wider than the waist and narrower than the
  //     head. That is the "wider shoulders than the reference" line in the
  //     brief: the reference has NO shoulder, it is one smooth capsule, so a
  //     shelf is the cheapest thing that stops us reading as a copy of it.
  //
  // Limbs are now two segments each. A knee is what makes a run legible --
  // measured on the reference, knee flexion is 17-21 deg at a walk and 45-49
  // at a jog, a bigger swing than the hip's -- and our old leg had none, so it
  // scissored and slid its foot up rather than bending.
  const RIG = {
    // v26: the body IS the character. 33.2 tall against 20.0 wide is 1.66:1,
    // which is the proportion the reference reads at; v25 was 27 on 24, or
    // 1.13, and no amount of limb work makes that silhouette soft. The crown
    // and the sole stay where they were -- 18.6 and about -17.3 -- so the
    // figure occupies the same space in the world and nothing downstream of it
    // has to move. What changed is where that height goes: into the bean.
    topY:18.6, bottomY:-14.19, maxR:9.95,
    // ON THE WIDEST LINE OF THE HEAD, not up by the crown. At 10.2 the plate's
    // top edge reached y 18.04 against a topY of 18.6, which is why there was
    // no pink left for a hat to sit on and every hat landed on the face.
    faceY:8.5,
    // everything ON the face -- eyes, pupils, mouth, cheeks -- scales off this
    // v26: bigger, and simpler on it. 14.4 across on a 20-wide body is 72% of
    // the width -- the face is meant to be the thing you read first.
    faceR:7.0,
    // how far the plate stands off the skin. 0.6-1.0 is the brief; 0.7 in the
    // middle keeps the whole cap inside that band once the head curves away.
    facePROUD:0.14,
    // the plate's half-extents. Width is about 1.5x the eye spacing (2*eyeX,
    // and eyeX is faceR*0.45, so 1.5x is 5.1); height is about 0.6 of the head
    // bulge, which runs from the waist pinch at 2.4 to topY 18.6.
    faceHalfW:5.40, faceHalfH:5.30,

    // ---- legs: hip -> knee -> ankle -> foot.
    // v26: almost none of this is visible. The hip sits at -12.0, deep inside
    // the bean, and thigh and shin are 1.6 each, so 3.2 units of leg carry the
    // body down to a sole at about -17.3 and the bean's own bottom at -14.6
    // covers all but the last couple of units. The bones are still there and
    // still bend -- the animation drives every one of them -- they are simply
    // under the skin now instead of standing below it on show.
    //
    // The radii barely change down the leg (2.60 -> 2.55 -> 2.50) because a
    // taper is what makes a limb read as two cylinders that meet. Held nearly
    // constant it reads as one soft connector.
    hipY:-12.5, thighLen:1.7, shinLen:1.7, legX:3.00,
    // v31: 2.60 -> 3.00. The reference's legs sit 2.7 apart measured between
    // their inner edges; at 2.60 with a leg 2.0 across ours had a gap of 1.2
    // and read as one column. 3.00 puts the gap at 2.1, which is the same
    // stance at our width. The bones move; the animation reads them.
    legR:1.95, kneeR:1.58, ankleR:1.08,
    // Short, broad, rounded, and carried forward of the ankle so the figure
    // has a front. Not a shoe on an ankle -- a toy's foot.
    // v26b: was 6.1 across and thrown 1.5 forward, which read as a shoe. Now
    // 4.4 across and almost under the body, so it carries the bean without
    // competing with it.
    footR:3.05, footScale:[1.00, 0.54, 1.20], footDY:1.415, footDZ:1.30,
    // v31: footDY -0.05 -> 1.415. The foot hangs off the ankle but it projects
    // FORWARD of it, and the rest knee bend of 0.13 turns everything below the
    // knee about a centre four units up -- so the further forward a point is,
    // the further it swings down. The old sphere sat close under the ankle and
    // barely felt it; a foot with a real toe drops 1.4 and tore away from the
    // leg. This is that swing, given back, so the sole lands on the y it has
    // always landed on. FOOT_PITCH cancels the tilt; this cancels the drop.

    // ---- arms: shoulder -> elbow -> wrist -> mitt.
    // The shoulder sits INSIDE the shell (body radius at y 4.2 is 10.4 against
    // a shoulderX of 9.9), so the joint is never a ball floating on the skin.
    // v26: high on the shoulder and short, so the arm reads as something the
    // body grew rather than something bolted to it. The shoulder is still
    // inside the shell (the bean is 9.8 wide at y 6.5 against a shoulderX of
    // 8.4), and the radii hold nearly level down the arm for the same reason
    // the leg's do.
    // v26b: the arm now tapers continuously -- 3.05 at the shoulder down to
    // 2.15 at the wrist -- instead of running at one radius and stopping. A
    // tube that never changes width is what read as bolted on.
    shoulderY:3.7, shoulderX:9.41, upperLen:6.67, foreLen:5.28,
    armR:2.95, elbowR:2.30, armTipR:1.70,
    // v26c: THE SHOULDER STANDS FURTHER OUT, AND THE REST FLARE GIVES BACK
    // EXACTLY WHAT THAT COSTS.
    //
    // The bean is 9.06 wide at the shoulder and 10.2 at the belly, so it gets
    // WIDER underneath the joint the arm hangs from. The arm's only source of
    // outward travel was flare(), and during the run flare() asks for 0.18 --
    // which buys 0.179 of radius per unit of arm against roughly 0.13 of bean,
    // starting from a shoulder 0.65 INSIDE the shell. The centreline therefore
    // never got out: it ran parallel to the skin, just under it, the whole way
    // down. That is why the arm read as a blister on the torso rather than as
    // an arm, and why it was worst on whichever side had the elbow closed -- a
    // bent forearm travels outward by only cos(elbow) of what a straight one
    // does, and at the run's -0.85 that is two thirds.
    //
    // 8.4 -> 9.2 moves every point of the arm out by 0.8 in EVERY pose,
    // which a rotation cannot do: a lean is applied about z, so on a pose that
    // has already thrown the arm forward -- the dive -- it tilts the arm INWARD
    // instead and trades one pose's problem for another's. A translation has no
    // orientation to get wrong.
    //
    // That 0.8 is paid for at rest, and only at rest: armZ drops from 0.30
    // to 0.1924, which is the flare that puts the wrist back on the exact x it
    // was approved at (shoulderX + sin(z)*(upperLen + foreLen*cos(elbowX))).
    // Animated poses set their own flare and never read armZ, so they keep the
    // whole 0.8. No pose angle, no timing, and no line of 12_charanim.js is
    // touched.
    // v26b: smaller and flatter. A big sphere on the end is a ball, not a mitt.
    mittR:2.90,

    // ---- suit. Three landmarks down the front, which is what lets a later
    // skin repaint panels instead of repainting one smooth egg.
    // The pinch at 2.4 sits directly under the head bulge, so it reads as a
    // COLLAR, not a waist -- the belt belongs lower, on the actual hips.
    // v26: no collar, no belt, no emblem. A seam across the middle is exactly
    // the segmentation this pass exists to remove, and detail is not a fix for
    // a shape. They are kept as zero so anything reading the names still
    // reads, and drawn only when plainBody is off.
    collarY:2.4, collarR:0.50, beltY:-4.0, beltR:0.62,
    emblemY:-0.5, emblemProud:0.30, emblemHalfW:2.7, emblemHalfH:2.3,
    plainBody:true,
    hatScale:0.98,
    // v26 approval pass: judge the silhouette first. No mouth, no brows, no
    // cheeks -- see the note on the mouth below.
    neutralFace:true
  };
  RIG.waistY = (RIG.topY + RIG.bottomY)/2;

  // Profile of the bean, bottom to top. x is radius, y is height.
  // Bottom to top: a rounded base, a body that swells and then pinches at the
  // waist, and above it a head bulge wider than the body -- which is what puts
  // the head in the silhouette instead of leaving one flat oval.
  // v25: the same four landmarks, moved apart. Hips, then a waist pinched to
  // 9.5 (was 10.8), then a shoulder shelf at 11.1, then the head at 12.0. Four
  // distinct widths up the figure instead of two, which is what gives the
  // silhouette something to read at gameplay distance where detail is gone.
  // v26. One shape, bottom to top: a softly rounded base, a long broad middle
  // that holds its full width from -2 to +2, and a smooth narrowing to the
  // crown. There is no waist pinch and no shoulder shelf any more -- v25 put
  // four distinct widths up the figure "to give the silhouette something to
  // read", and what that actually read as was segments. A bean has one width
  // that swells and falls away.
  // v26b. The v26 profile held its full width from -2 to +2, and two parallel
  // side walls over four units is what made the middle read as a capsule. The
  // widest line drops to the belly at -2.6 and the shape narrows continuously
  // from there to the crown, so no two rows up the figure share a width.
  // v27: GENERATED, not typed. See the note above: one smooth curve fitted to
  // the reference's measured width envelope, sampled densely and cosine-spaced
  // so the crown and the base get the points their curvature needs.
  const BEAN_Y0 = -14.19, BEAN_Y1 = 18.6;     // hem and crown
  const BEAN_W  = 19.58;                      // widest across the figure
  const BEAN_DS = 1.000;                      // depth trim: smoothing the
                                              // measured bands costs a little
                                              // front-to-back, and the side
                                              // view is a gate of its own
  const BEAN_RINGS = 96, BEAN_SEG = 56;
  // t up from the hem, then half-width, half-depth and forward offset, each as
  // a fraction of BEAN_W. Read off the reference every 10% of its body height;
  // the 0.05 and 0.95 rows are where its own end bands actually sampled, and
  // the 0 and 1 rows close the shape.
  //
  // One deliberate departure: the reference measures 1.000 at t=0.60, a shelf
  // where its shoulders sit. Ours is 0.975, because a shelf is the one thing
  // the brief asks the shoulders NOT to do -- they slope in instead.
  const BEAN_TABLE = [
    [0.0000,0.0949,0.0000,-0.0000], [0.0050,0.0000,0.0000,-0.0009], [0.0101,0.0096,0.0007,-0.0035], [0.0151,0.0689,0.0302,-0.0075],
    [0.0201,0.1889,0.1225,-0.0126], [0.0251,0.2876,0.2047,-0.0187], [0.0302,0.3754,0.2744,-0.0255], [0.0352,0.4422,0.3357,-0.0328],
    [0.0402,0.5195,0.4023,-0.0403], [0.0452,0.5670,0.4499,-0.0478], [0.0503,0.6045,0.4886,-0.0550], [0.0553,0.6548,0.5376,-0.0618],
    [0.0603,0.6808,0.5654,-0.0678], [0.0653,0.7173,0.6019,-0.0729], [0.0704,0.7478,0.6336,-0.0768], [0.0754,0.7742,0.6614,-0.0792],
    [0.0804,0.7955,0.6850,-0.0646], [0.0854,0.8148,0.7066,-0.0501], [0.0905,0.8325,0.7266,-0.0436], [0.0955,0.8468,0.7435,-0.0380],
    [0.1005,0.8602,0.7595,-0.0330], [0.1055,0.8709,0.7727,-0.0297], [0.1106,0.8810,0.7848,-0.0267], [0.1156,0.8904,0.7964,-0.0252],
    [0.1206,0.8993,0.8073,-0.0238], [0.1256,0.9076,0.8178,-0.0224], [0.1307,0.9154,0.8278,-0.0212], [0.1357,0.9227,0.8373,-0.0201],
    [0.1407,0.9295,0.8464,-0.0189], [0.1457,0.9358,0.8550,-0.0178], [0.1508,0.9417,0.8632,-0.0168], [0.1558,0.9472,0.8709,-0.0157],
    [0.1608,0.9524,0.8783,-0.0147], [0.1658,0.9572,0.8853,-0.0137], [0.1709,0.9617,0.8920,-0.0127], [0.1759,0.9659,0.8984,-0.0118],
    [0.1809,0.9698,0.9044,-0.0109], [0.1859,0.9734,0.9101,-0.0100], [0.1910,0.9766,0.9154,-0.0092], [0.1960,0.9797,0.9204,-0.0084],
    [0.2010,0.9824,0.9251,-0.0076], [0.2060,0.9849,0.9295,-0.0069], [0.2111,0.9872,0.9336,-0.0063], [0.2161,0.9893,0.9374,-0.0056],
    [0.2211,0.9912,0.9410,-0.0051], [0.2261,0.9929,0.9443,-0.0045], [0.2312,0.9944,0.9474,-0.0039], [0.2362,0.9957,0.9502,-0.0034],
    [0.2412,0.9968,0.9528,-0.0029], [0.2462,0.9978,0.9552,-0.0024], [0.2513,0.9986,0.9573,-0.0019], [0.2563,0.9992,0.9592,-0.0015],
    [0.2613,0.9996,0.9609,-0.0010], [0.2663,0.9999,0.9624,-0.0007], [0.2714,1.0000,0.9636,-0.0003], [0.2764,1.0000,0.9647,0.0000],
    [0.2814,0.9998,0.9655,0.0004], [0.2864,0.9994,0.9662,0.0007], [0.2915,0.9990,0.9666,0.0010], [0.2965,0.9984,0.9669,0.0012],
    [0.3015,0.9977,0.9670,0.0015], [0.3065,0.9969,0.9669,0.0018], [0.3116,0.9959,0.9666,0.0021], [0.3166,0.9948,0.9662,0.0023],
    [0.3216,0.9936,0.9655,0.0025], [0.3266,0.9922,0.9648,0.0028], [0.3317,0.9908,0.9639,0.0030], [0.3367,0.9892,0.9628,0.0031],
    [0.3417,0.9874,0.9616,0.0033], [0.3467,0.9856,0.9602,0.0034], [0.3518,0.9835,0.9587,0.0035], [0.3568,0.9813,0.9571,0.0036],
    [0.3618,0.9788,0.9554,0.0037], [0.3668,0.9762,0.9536,0.0037], [0.3719,0.9733,0.9517,0.0038], [0.3769,0.9702,0.9497,0.0038],
    [0.3819,0.9670,0.9476,0.0038], [0.3869,0.9636,0.9455,0.0038], [0.3920,0.9601,0.9432,0.0037], [0.3970,0.9564,0.9409,0.0036],
    [0.4020,0.9526,0.9386,0.0035], [0.4070,0.9486,0.9362,0.0034], [0.4121,0.9445,0.9337,0.0033], [0.4171,0.9404,0.9312,0.0031],
    [0.4221,0.9362,0.9287,0.0029], [0.4271,0.9321,0.9261,0.0028], [0.4322,0.9281,0.9235,0.0025], [0.4372,0.9243,0.9209,0.0023],
    [0.4422,0.9205,0.9182,0.0020], [0.4472,0.9170,0.9156,0.0018], [0.4523,0.9136,0.9129,0.0015], [0.4573,0.9104,0.9103,0.0012],
    [0.4623,0.9074,0.9077,0.0010], [0.4673,0.9046,0.9051,0.0008], [0.4724,0.9019,0.9025,0.0006], [0.4774,0.8996,0.8999,0.0004],
    [0.4824,0.8976,0.8973,0.0003], [0.4874,0.8959,0.8946,0.0002], [0.4925,0.8945,0.8920,0.0001], [0.4975,0.8933,0.8893,0.0000],
    [0.5025,0.8924,0.8867,0.0000], [0.5075,0.8917,0.8840,-0.0000], [0.5126,0.8914,0.8814,0.0000], [0.5176,0.8913,0.8787,0.0001],
    [0.5226,0.8916,0.8760,0.0002], [0.5276,0.8921,0.8733,0.0005], [0.5327,0.8930,0.8705,0.0007], [0.5377,0.8942,0.8677,0.0011],
    [0.5427,0.8956,0.8649,0.0015], [0.5477,0.8973,0.8620,0.0020], [0.5528,0.8992,0.8593,0.0024], [0.5578,0.9014,0.8566,0.0028],
    [0.5628,0.9039,0.8541,0.0032], [0.5678,0.9065,0.8516,0.0036], [0.5729,0.9092,0.8492,0.0039], [0.5779,0.9120,0.8469,0.0043],
    [0.5829,0.9147,0.8447,0.0046], [0.5879,0.9173,0.8426,0.0049], [0.5930,0.9196,0.8406,0.0052], [0.5980,0.9217,0.8388,0.0054],
    [0.6030,0.9235,0.8371,0.0057], [0.6080,0.9249,0.8355,0.0059], [0.6131,0.9260,0.8341,0.0061], [0.6181,0.9267,0.8328,0.0062],
    [0.6231,0.9270,0.8316,0.0063], [0.6281,0.9269,0.8304,0.0063], [0.6332,0.9262,0.8293,0.0063], [0.6382,0.9250,0.8283,0.0062],
    [0.6432,0.9235,0.8274,0.0061], [0.6482,0.9216,0.8265,0.0059], [0.6533,0.9195,0.8256,0.0058], [0.6583,0.9172,0.8248,0.0057],
    [0.6633,0.9147,0.8240,0.0056], [0.6683,0.9122,0.8232,0.0054], [0.6734,0.9097,0.8224,0.0053], [0.6784,0.9071,0.8217,0.0052],
    [0.6834,0.9046,0.8210,0.0050], [0.6884,0.9021,0.8204,0.0049], [0.6935,0.8997,0.8198,0.0047], [0.6985,0.8973,0.8192,0.0045],
    [0.7035,0.8949,0.8186,0.0043], [0.7085,0.8927,0.8180,0.0041], [0.7136,0.8906,0.8175,0.0039], [0.7186,0.8886,0.8170,0.0037],
    [0.7236,0.8865,0.8164,0.0034], [0.7286,0.8844,0.8159,0.0032], [0.7337,0.8823,0.8154,0.0029], [0.7387,0.8800,0.8148,0.0027],
    [0.7437,0.8777,0.8142,0.0024], [0.7487,0.8752,0.8136,0.0021], [0.7538,0.8727,0.8128,0.0019], [0.7588,0.8700,0.8120,0.0016],
    [0.7638,0.8672,0.8110,0.0013], [0.7688,0.8642,0.8099,0.0009], [0.7739,0.8611,0.8086,0.0005], [0.7789,0.8579,0.8072,-0.0000],
    [0.7839,0.8545,0.8055,-0.0007], [0.7889,0.8509,0.8037,-0.0014], [0.7940,0.8471,0.8017,-0.0023], [0.7990,0.8431,0.7996,-0.0033],
    [0.8040,0.8388,0.7975,-0.0043], [0.8090,0.8344,0.7952,-0.0054], [0.8141,0.8298,0.7928,-0.0066], [0.8191,0.8249,0.7902,-0.0079],
    [0.8241,0.8197,0.7875,-0.0093], [0.8291,0.8143,0.7845,-0.0107], [0.8342,0.8085,0.7813,-0.0122], [0.8392,0.8024,0.7778,-0.0137],
    [0.8442,0.7959,0.7740,-0.0153], [0.8492,0.7890,0.7699,-0.0168], [0.8543,0.7817,0.7654,-0.0184], [0.8593,0.7739,0.7605,-0.0200],
    [0.8643,0.7657,0.7550,-0.0214], [0.8693,0.7571,0.7489,-0.0228], [0.8744,0.7480,0.7420,-0.0239], [0.8794,0.7383,0.7342,-0.0248],
    [0.8844,0.7280,0.7253,-0.0254], [0.8894,0.7170,0.7154,-0.0258], [0.8945,0.7051,0.7043,-0.0259], [0.8995,0.6925,0.6921,-0.0258],
    [0.9045,0.6791,0.6788,-0.0254], [0.9095,0.6651,0.6644,-0.0248], [0.9146,0.6501,0.6488,-0.0239], [0.9196,0.6343,0.6322,-0.0229],
    [0.9246,0.6176,0.6145,-0.0215], [0.9296,0.5994,0.5952,-0.0201], [0.9347,0.5800,0.5744,-0.0179], [0.9397,0.5589,0.5518,-0.0150],
    [0.9447,0.5401,0.5313,-0.0121], [0.9497,0.5160,0.5058,-0.0093], [0.9548,0.4943,0.4823,-0.0066], [0.9598,0.4710,0.4575,-0.0043],
    [0.9648,0.4409,0.4271,-0.0027], [0.9698,0.4127,0.3981,-0.0015], [0.9749,0.3745,0.3603,-0.0007], [0.9799,0.3376,0.3235,-0.0003],
    [0.9849,0.2951,0.2823,-0.0001], [0.9899,0.2387,0.2280,0.0001], [0.9950,0.1777,0.1676,0.0001], [1.0000,0.0242,0.0283,-0.0000]
  ];
  // Monotone cubic (Fritsch-Carlson). A plain spline through a hem this steep
  // overshoots and puts a lip on the shape; this cannot.
  function pchip(xs, ys){
    const n = xs.length, d = [], m = [];
    for(let i=0;i<n-1;i++) d[i] = (ys[i+1]-ys[i])/(xs[i+1]-xs[i]);
    m[0] = d[0]; m[n-1] = d[n-2];
    for(let i=1;i<n-1;i++){
      if(d[i-1]*d[i] <= 0) m[i] = 0;
      else {
        const w1 = 2*(xs[i+1]-xs[i]) + (xs[i]-xs[i-1]);
        const w2 = (xs[i+1]-xs[i]) + 2*(xs[i]-xs[i-1]);
        m[i] = (w1 + w2) / (w1/d[i-1] + w2/d[i]);
      }
    }
    return (x)=>{
      if(x <= xs[0]) return ys[0];
      if(x >= xs[n-1]) return ys[n-1];
      let i = 0; while(i < n-2 && x > xs[i+1]) i++;
      const h = xs[i+1]-xs[i], t = (x-xs[i])/h, t2 = t*t, t3 = t2*t;
      return ys[i]*(2*t3-3*t2+1) + h*m[i]*(t3-2*t2+t)
           + ys[i+1]*(-2*t3+3*t2) + h*m[i+1]*(t3-t2);
    };
  }
  const _bt = BEAN_TABLE, _bx = _bt.map(r=>r[0]);
  const BEAN_FW = pchip(_bx, _bt.map(r=>r[1]));    // half-width fraction
  const BEAN_FD = (()=>{ const f = pchip(_bx, _bt.map(r=>r[2])); return t=>f(t)*BEAN_DS; })();
  const BEAN_FZ = pchip(_bx, _bt.map(r=>r[3]));    // forward offset fraction
  const beanT   = (y)=> (y - BEAN_Y0) / (BEAN_Y1 - BEAN_Y0);
  // The profile is still published as [radius, y] pairs, because the face cap,
  // the trims and the emblem all read it that way.
  const BEAN_PROFILE = (()=>{
    const out = [];
    for(let i=0;i<BEAN_RINGS;i++){
      const t = i/(BEAN_RINGS-1);
      out.push([ +(BEAN_FW(t)*BEAN_W*0.5).toFixed(4),
                 +(BEAN_Y0 + t*(BEAN_Y1-BEAN_Y0)).toFixed(4) ]);
    }
    return out;
  })();
  // The head's radius at a height, straight off the profile the lathe is built
  // from. The face reads this rather than carrying its own copy of 12.4, so a
  // head that changes shape takes its face with it instead of swallowing it --
  // which is exactly the regression v22 shipped.
  function beanRadiusAt(y){
    const p = BEAN_PROFILE;
    for(let i=0;i<p.length-1;i++){
      const [r0,y0] = p[i], [r1,y1] = p[i+1];
      if(y >= Math.min(y0,y1) && y <= Math.max(y0,y1)){
        const t = (y - y0) / (y1 - y0);
        return r0 + t*(r1 - r0);
      }
    }
    return RIG.maxR;
  }
  // The same shell read across instead of side on. Anything that has to sit ON
  // the body -- the face cap and everything pinned to it -- needs the depth,
  // not the width, or it floats in front at the middle and sinks at the edges.
  function beanDepthAt(y){ return BEAN_FD(Math.max(0, Math.min(1, beanT(y)))) * BEAN_W * 0.5; }
  function beanZAt(y){ return BEAN_FZ(Math.max(0, Math.min(1, beanT(y)))) * BEAN_W; }
  // The cap's radius, and the angles that give it the width and height asked
  // for. asin because the half-extent is a chord across a sphere of that radius.
  const FACE_R3 = beanRadiusAt(RIG.faceY) + RIG.facePROUD;
  const FACE_DPHI   = Math.asin(Math.min(0.95, RIG.faceHalfW / FACE_R3));
  const FACE_DTHETA = Math.asin(Math.min(0.95, RIG.faceHalfH / FACE_R3));
  // A cap centred on +z at the head's widest line. `grow` widens the angles for
  // the dark rim behind the white plate.
  // v25 §2: TESSELLATION, NOT SHAPE. Nothing below changes a radius, a length
  // or a pose -- only how many segments each rounded piece is built from. The
  // jointed limbs and the suit took the racer from 3,644 triangles to 7,836,
  // and at twenty-four racers that is an extra hundred thousand triangles a
  // frame, which pushed the Medium frame past its 14ms cap. The face caps alone
  // were 2,080 of them: 26x20 segments across a cap spanning 0.7 radians is a
  // segment every degree and a half, on a part that is a few dozen pixels wide
  // in play. These are the lowest counts that still read smooth at the lobby
  // camera, which is the closest the player ever gets to the model.
  // v26: an OVAL panel, not a rectangle.
  //
  // A sphere patch is rectangular in angle, and at the size this face wants to
  // be that rectangle is the first thing you see -- four hard corners and a
  // border, a sticker on a bean. Mapping the patch's square (u,v) domain onto a
  // disc bends the boundary into an ellipse and leaves the middle almost
  // untouched, so the plate still lies on the head's curve and now ends in a
  // soft edge. 28x20 segments because the outline is the silhouette here.
  // The face panel, built as a DISC rather than as a rectangular sphere patch.
  //
  // Two earlier tries got the outline wrong. A sphere patch is rectangular in
  // angle, and at this size that rectangle is the first thing you see. Bending
  // that patch's square domain onto a circle fixes the corners but not the
  // edge: the mapping is not monotonic, so interior rows of the grid bulge past
  // the boundary row and the silhouette becomes the highest of several rows --
  // a scalloped edge, which is exactly what it looked like.
  //
  // A radial fan has one boundary ring by construction, so the outline is a
  // single ellipse and nothing can poke through it.
  //
  // The vertices are then pushed out to the BEAN's radius at their own height,
  // not to a sphere's. The body is a lathe that is still widening below the
  // face, so a sphere centred at face height sinks inside the shell lower down
  // and the body comes through the plate. Following the profile keeps the whole
  // panel on the surface it is meant to be lying on.
  function faceCapGeometry(radius, grow){
    const dphi = FACE_DPHI*(grow||1), dth = FACE_DTHETA*(grow||1);
    const RINGS = 14, SEG = 40;
    const proud = (radius - FACE_R3) + RIG.facePROUD;
    const pos = [], idx = [];
    const put = (u, w)=>{
      const p2 = u*dphi, t2 = w*dth;
      const y = FACE_R3*Math.sin(t2);
      const yy = RIG.faceY + y;
      const radX = beanRadiusAt(yy) + proud, radZ = beanDepthAt(yy) + proud;
      pos.push(radX*Math.sin(p2), y, beanZAt(yy) - beanZAt(RIG.faceY) + radZ*Math.cos(p2));
    };
    put(0, 0);                                     // centre
    for(let j=1;j<=RINGS;j++){
      const rr = j/RINGS;
      for(let k=0;k<SEG;k++){
        const a = k/SEG*Math.PI*2;
        put(rr*Math.cos(a), rr*Math.sin(a));
      }
    }
    const ringStart = (j)=> 1 + (j-1)*SEG;
    for(let k=0;k<SEG;k++){                        // centre fan
      idx.push(0, ringStart(1)+k, ringStart(1)+((k+1)%SEG));
    }
    for(let j=1;j<RINGS;j++){
      const a0 = ringStart(j), b0 = ringStart(j+1);
      for(let k=0;k<SEG;k++){
        const k2 = (k+1)%SEG;
        idx.push(a0+k, b0+k, b0+k2);
        idx.push(a0+k, b0+k2, a0+k2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }
  // Where a feature at height `dy` above the cap's centre sits ON the cap, and
  // how far to pitch it so it lies flat against the curve there. One helper, so
  // an eye, a mouth and a cheek cannot each drift off the surface differently.
  const faceOn = (dy, dx, out)=>{
    const yy = RIG.faceY + dy, o = out||0;
    const rx = beanRadiusAt(yy) + RIG.facePROUD + o;
    const rz = beanDepthAt(yy) + RIG.facePROUD + o;
    const k  = Math.max(0, 1 - ((dx||0)/rx)*((dx||0)/rx));
    const z  = beanZAt(yy) - beanZAt(RIG.faceY) + Math.sqrt(Math.max(0.0001, rz*rz*k));
    const r  = FACE_R3 + o;
    return { y:dy, z, pitch:Math.asin(Math.max(-1, Math.min(1, -dy/r))) };
  };
  // v25: the same two ideas, freed from the face so the SUIT can use them. A
  // cap of any size, anywhere on the shell, and a point on that cap. The chest
  // badge is built exactly the way the face is, for exactly the same reason:
  // anything flat laid on a round body either floats at the middle or sinks at
  // the edges, and tuning a z until it looks right only hides which one.
  function capGeometry(radius, halfW, halfH, segW, segH){
    const dphi = Math.asin(Math.min(0.95, halfW/radius));
    const dth  = Math.asin(Math.min(0.95, halfH/radius));
    return new THREE.SphereGeometry(radius, segW||12, segH||9,
      Math.PI/2 - dphi, dphi*2, Math.PI/2 - dth, dth*2);
  }
  const capOn = (radius, dy, dx, out)=>{
    const r = radius + (out||0);
    const z = Math.sqrt(Math.max(0.01, r*r - dy*dy - (dx||0)*(dx||0)));
    return { y:dy, z, pitch:Math.asin(Math.max(-1, Math.min(1, -dy/r))) };
  };

  // One shell, built ring by ring so each ring can be its own ellipse at its
  // own depth and its own forward offset. `grow` inflates it for the flash
  // shell; `pad` pushes it out along the surface rather than scaling it, so a
  // rim stays even top to bottom instead of fanning out at the widest line.
  function beanSurface(grow, pad){
    const pos = [], idx = [], nrm = [];
    for(let i=0;i<BEAN_RINGS;i++){
      const t = i/(BEAN_RINGS-1);
      const y = BEAN_Y0 + t*(BEAN_Y1-BEAN_Y0);
      const rx = BEAN_FW(t)*BEAN_W*0.5*grow + (pad||0);
      const rz = BEAN_FD(t)*BEAN_W*0.5*grow + (pad||0);
      const zc = BEAN_FZ(t)*BEAN_W;
      for(let k=0;k<BEAN_SEG;k++){
        const a = k/BEAN_SEG*Math.PI*2;
        pos.push(Math.cos(a)*rx, y, zc + Math.sin(a)*rz);
      }
    }
    for(let i=0;i<BEAN_RINGS-1;i++){
      const a0 = i*BEAN_SEG, b0 = (i+1)*BEAN_SEG;
      for(let k=0;k<BEAN_SEG;k++){
        const k2 = (k+1)%BEAN_SEG;
        idx.push(a0+k, b0+k, b0+k2);
        idx.push(a0+k, b0+k2, a0+k2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  let _beanGeo=null, _beanOutGeo=null;
  function beanGeometry(){
    if(!_beanGeo){
      _beanGeo = beanSurface(1, 0);
      // Baked ambient occlusion, as a vertex colour: the crease where the legs
      // meet the body and the hollow under each shoulder go a shade darker.
      const pos = _beanGeo.attributes.position, n = pos.count, col = new Float32Array(n*3);
      for(let i=0;i<n;i++){
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        let ao = 1;
        if(y < -3.4) ao -= 0.24 * Math.min(1, (-3.4 - y)/5.0);
        for(const s of [-1,1]){
          const d = Math.hypot(x - s*RIG.shoulderX, y - RIG.shoulderY, z);
          if(d < 6.5) ao -= 0.16 * (1 - d/6.5);
        }
        col[i*3] = col[i*3+1] = col[i*3+2] = ao;
      }
      _beanGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      // The bean is the only thing on the body mesh, so every vertex of it is
      // bound to one bone. That is the same for every racer, so it is baked in
      // here once and the geometry is shared by all twenty-four.
      rigidWeights(_beanGeo, BONE.body);
    }
    return _beanGeo;
  }
  function beanOutlineGeometry(){
    if(!_beanOutGeo){
      // grown along the profile normal-ish, so the rim stays even top to bottom
      _beanOutGeo = beanSurface(1, 0.34);
    }
    return _beanOutGeo;
  }

  // ---- the skeleton ------------------------------------------------------
  // One index per animated pivot. Anything that never moves on its own hangs
  // off the nearest thing that does, which is why there are no bones for the
  // feet, the hands, the eyebrows or most of a hat: a foot is part of its leg.
  // Indices 0-14 are exactly what they were. The locker, the checks and the
  // profile screen all reach for bones by name off the returned object, but the
  // merged geometry stores a bone INDEX per vertex, so renumbering the existing
  // ones would silently re-parent every part of every character. The new joints
  // are appended instead.
  const BONE = { tilt:0, body:1, legL:2, legR:3, armL:4, armR:5, head:6, face:7,
                 scleraL:8, scleraR:9, pupilL:10, pupilR:11, tongue:12,
                 hat:13, hatSpin:14,
                 // v25: the second segment of each limb, and the thing on the end
                 kneeL:15, kneeR:16, footL:17, footR:18,
                 elbowL:19, elbowR:20, handL:21, handR:22 };
  const BONE_COUNT = 23;

  function rigidWeights(geo, boneIndex){
    const n = geo.attributes.position.count;
    const si = new Uint16Array(n*4), sw = new Float32Array(n*4);
    for(let i=0;i<n;i++){ si[i*4] = boneIndex; sw[i*4] = 1; }
    geo.setAttribute('skinIndex',  new THREE.Uint16BufferAttribute(si, 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  }

  // Concatenate the parts into one indexed buffer. Every part arrives already
  // in the bind pose (its geometry has had its bone's matrix applied), carries
  // a flat colour, and belongs to exactly one bone.
  function mergeParts(parts){
    let nv = 0, ni = 0;
    for(const p of parts){ nv += p.geo.attributes.position.count; ni += p.geo.index.count; }
    const pos = new Float32Array(nv*3), nor = new Float32Array(nv*3), col = new Float32Array(nv*3);
    const si  = new Uint16Array(nv*4),  sw  = new Float32Array(nv*4);
    const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
    let v = 0, k = 0;
    const c = new THREE.Color();
    for(const p of parts){
      const g = p.geo, n = g.attributes.position.count;
      pos.set(g.attributes.position.array, v*3);
      nor.set(g.attributes.normal.array, v*3);
      for(let i=0;i<n;i++){
        if(p.colorAt) p.colorAt(c, g, i); else c.copy(p.color);
        col[(v+i)*3] = c.r; col[(v+i)*3+1] = c.g; col[(v+i)*3+2] = c.b;
      }
      // Most parts belong to exactly one bone. A part may instead arrive with
      // its own per-vertex weights -- the arm does, because it is one surface
      // that has to bend at two joints without showing where they are.
      if(p.weights){
        si.set(p.weights.si, v*4);
        sw.set(p.weights.sw, v*4);
      } else {
        for(let i=0;i<n;i++){ si[(v+i)*4] = p.bone; sw[(v+i)*4] = 1; }
      }
      const gi = g.index.array;
      for(let i=0;i<gi.length;i++) idx[k+i] = gi[i] + v;
      v += n; k += gi.length;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    out.setAttribute('normal',   new THREE.Float32BufferAttribute(nor, 3));
    out.setAttribute('color',    new THREE.Float32BufferAttribute(col, 3));
    out.setAttribute('skinIndex',  new THREE.Uint16BufferAttribute(si, 4));
    out.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    out.setIndex(new THREE.BufferAttribute(idx, 1));
    // Limbs swing well outside the bind pose, and a sphere drawn round the
    // bind pose culls an arm-first racer at the edge of the screen.
    out.computeBoundingSphere(); out.boundingSphere.radius *= 1.4;
    return out;
  }

  // ---- ONE ARM, ONE SWEPT SURFACE, AND ITS FIRST FIFTH IS THE SHOULDER.
  //
  // v26 already built the arm as a single lathe rather than as a shoulder ball,
  // an upper cylinder, an elbow ball and a forearm stacked end to end, and it
  // STILL read as a tube stuck on the side of the body. The lathe is the
  // problem. It has one radius per station, so the section can only ever be a
  // circle, and it was closed at the top by a squashed hemisphere -- a shoulder
  // bulb by construction, with a rim where the dome met the shaft and nothing
  // at all tying it into the torso.
  //
  // What the reference does instead, measured off its rendered idle mask rather
  // than guessed at. One orthographic camera; its right arm isolated by skin
  // weight so the torso cannot contaminate the contour; every row's outer and
  // inner edge read off the pixels in front and in side view; the limb's own
  // cant divided back out so these are perpendicular sections and not slanted
  // scanlines:
  //
  //   * THE FREE LIMB DOES NOT TAPER. Elbow to wrist it holds 0.255 wide by
  //     0.313 deep on a figure 1.841 tall -- within 3% the whole way down. The
  //     instinct that a forearm must be visibly narrower than an upper arm is
  //     wrong about this character.
  //   * IT IS NOT ROUND. Width over depth is 0.82 down the free limb and 0.52
  //     up at the shoulder: an ellipse deeper than it is wide, getting rounder
  //     as it descends. Ours was a circle -- 0.94, by construction -- and a
  //     circular section lit from one side is exactly what reads as pipe.
  //   * THE FULLNESS IS ALL IN THE SHOULDER, AND IT IS IN DEPTH. The section
  //     reaches 0.399 deep just under the joint, 27% more than the forearm, and
  //     is back to 0.297 by the elbow. That 27% is the whole of the "upper arm
  //     fuller, narrowing toward the elbow" read, and it lives front to back,
  //     where a front view cannot see it and a 3/4 view cannot miss it.
  //   * THE ROOT DIES TO A POINT INSIDE THE BODY. The arm surface starts 30% of
  //     a limb-length ABOVE the shoulder joint as a knife edge lying flat under
  //     the skin, opens out as it descends, and does not clear the torso's own
  //     silhouette until about 22% above the joint. There is no cap, no ball and
  //     no socket up there because there is no END up there: it is a wedge that
  //     fades into the shell.
  //
  // So: a swept surface, not a lathe. A centreline, and an ellipse with its own
  // width and its own depth at every station, both read off the table below.
  // The root runs up INSIDE the bean and closes there, so there is no cap and
  // no rim anywhere on the arm at either end -- see ARM_BLEND0 for why it is
  // bound to the arm bone and not shared with the torso.
  //
  // Authored in the SHOULDER bone's local space: down the arm is -Y, +Z is
  // forward, and the elbow and wrist bones sit at -upperLen and -(upperLen +
  // foreLen) along it. s runs down the limb -- 0 at the shoulder joint, 1 at the
  // wrist, negative inside the torso.
  //
  //                    s     halfW  halfD
  // THE ROOT IS THE ONE PLACE THE REFERENCE'S OWN NUMBERS CANNOT BE COPIED.
  // Up there its mask measures 0.14 wide against 0.32 deep -- an aspect of 0.2,
  // a vertical blade -- because in the reference that band is not a limb at
  // all, it is the TORSO's flank, wearing the arm's weights. Its depth is the
  // body's depth. Ours is a separate shell emerging from a bean that already
  // supplies that volume, so copying the number gives a knife edge whose blade
  // lands exactly on the silhouette, and a shoulder with a crest on it. The
  // depth is cut back until the section comes out of the skin at an aspect of
  // about 0.42 -- a rounded lobe swelling out of the flank rather than a fin.
  // Measured against the real lathe with the rest pose applied, the surface
  // breaks the skin at s = -0.25; the ring above it is 0.19 under and the one
  // above that 0.43, which is margin enough for the FACETED bean to dip inside
  // the curve these are checked against.
  // v30: FEWER KNOTS, AND THE MITT IS ON THE END OF THE SAME TABLE.
  //
  // v29c had 34 rows and fed every one of them to pchip as an exact radius, so
  // every wobble in the measurement became a real feature of the surface.
  // Differencing that table says exactly what the eye said:
  //
  //     s        dW/ds     dD/ds
  //   0.213      +2.41     -1.11
  //   0.266      -0.75     -7.55     <- width turns over; depth knees
  //   0.692      +1.32      0.00     <- and width turns back
  //
  // A width slope that goes +2.41, -0.75, +1.32 is a bulge, a pinch and a
  // second bulge -- the bicep bump and the kink. A depth slope that goes from
  // -1.11 to -7.55 in one step is a shoulder that stops dead: the ball, and the
  // crease under it. Neither is in the reference; both are the interpolator
  // chasing noise.
  //
  // So the profile is a SMOOTHING fit now, not an interpolating one: few knots,
  // placed where the shape actually turns, with the measured envelope preserved
  // (peak depth 3.90 against a measured 3.98, free limb 3.11 against 3.13,
  // free width 2.58 against a measured 2.51-2.67) and the local wiggles dropped.
  // The cost is being up to 0.26 fuller than measured through the elbow, which
  // is the whole point: that is where the crease was.
  //
  // The rows past s = 1.0 are the MITT, unchanged in every dimension -- 2.90 at
  // its widest, 7.40 long, the same lobes -- but expressed in the limb's own
  // parameter so that one table, one sweep and ONE set of normals run from
  // inside the torso to the fingertip. There is no longer an arm surface and a
  // hand surface to intersect, which is what the wrist ring line was.
  const LIMB_SECTION = [
    // the buried root, and the emergence the shoulder pass already approved
    [-0.336, 0.05, 0.30], [-0.214, 0.83, 1.67], [-0.060, 1.76, 3.30],
    // the shoulder swell: one broad maximum, no shelf either side of it
    [ 0.000, 2.02, 3.72], [ 0.120, 2.28, 3.90],
    // and one continuous easing into the free limb. No second turn anywhere.
    [ 0.300, 2.54, 3.40], [ 0.480, 2.58, 3.16], [ 0.700, 2.58, 3.11],
    // THE WRIST IS A NARROWING, AND IT HAS TO BE, or there is no hand.
    //
    // The first v30 ran the forearm dead level at 2.58 into a palm of 2.90 and
    // eased the depth down across the whole join. That removed the ring line --
    // and removed the hand with it. A 12% flare spread over four units reads as
    // the end of a tube, not as a mitt, and "tube/capsule" is a rejection on its
    // own. The reference does not do that: measured, its forearm holds 2.58,
    // dips to a real local minimum of 2.53 at the wrist, then flares 22% to a
    // palm of 3.08. Ours dips to 2.46 and flares 18% to 2.90 -- the same shape
    // at the mitt's approved size. pchip lays a level tangent at a minimum, so
    // this is a soft waist and not a notch.
    [ 0.900, 2.54, 2.90], [ 1.000, 2.50, 2.62], [ 1.080, 2.46, 2.30],
    // ---- v31: THE MITT, MEASURED OFF THE REFERENCE'S OWN HAND MASK ----
    //
    // v30's was a club: 2.90 across at its widest against a 2.58 forearm, and
    // only 1.65 deep, so it was a flat paddle that barely flared. Isolating the
    // reference's Wrist/Finger/Thumb weights and reading its mask by row gives
    // a different object -- 6.14 across and 7.32 DEEP at the palm, on a hand
    // 7.6 long. Its mitt is deeper than it is wide, not a paddle at all.
    //
    // Taken at its measured width and, per the brief, only SLIGHTLY flattened
    // rather than carried all the way to its own depth: 0.88 of the width, so
    // it reads as a mitt with a front and a back instead of a blade. Against a
    // wrist waist of 2.46 the palm now flares 25%.
    [ 1.169, 2.73, 2.40],   // its t = 0.20
    [ 1.232, 2.82, 2.48],   //      t = 0.30
    [ 1.294, 2.93, 2.58],   //      t = 0.40
    [ 1.357, 3.07, 2.70],   //      t = 0.50, the widest line
    [ 1.417, 2.93, 2.58],   //      t = 0.60
    // and then the digits: the reference drops from 5.86 across to 4.24 in one
    // twentieth of its height, which is where its fingers part. Smoothed, and
    // carried by the lobes below rather than by a notch in the profile.
    [ 1.479, 2.35, 2.07],   //      t = 0.70
    [ 1.543, 2.05, 1.80],   //      t = 0.80
    [ 1.605, 1.75, 1.54],   //      t = 0.90
    [ 1.650, 1.10, 0.97],
    [ 1.664, 0.20, 0.11],   // and CLOSED. pchip clamps past its last knot, so
                            // without this row the ring before the apex was
                            // still 1.36 across and the fingertip capped flat,
                            // with a rim round it. The mitt's own table ran to
                            // zero at t = 1 and this one has to as well.
  ];
  // the apexes: one buried in the bean, one at the fingertip
  const ARM_S0 = -0.340, ARM_S1 = 1.665;
  // s <-> the mitt's own t, so the lobes still land where they always did
  const HAND_L = 7.40, HAND_NOTCH = 1.05;
  const LIMB_LEN = RIG.upperLen + RIG.foreLen;
  const HAND_S0 = 1.0 + 0.55/LIMB_LEN, HAND_SS = HAND_L/LIMB_LEN;
  // The one curve baked into the centreline. The reference's root sits 0.048
  // forward of where its free limb sits -- it comes out of the FRONT of the
  // flank and swings back into line by the elbow -- and 0.048 on its figure is
  // 1.00 on ours. Everything below the elbow is left dead straight on purpose:
  // the elbow bone owns that bend, and a curve baked here would be applied twice.
  const ARM_ROOT_Z = 1.00;
  // and it leans INTO the body on the way up. The reference's root needs no
  // such lean -- its arm and its flank are the same mesh, so the two can share
  // a surface -- but ours has to break a bean, and where it breaks it decides
  // what the shoulder looks like. Without the lean the surface comes out at
  // s = -0.25, where the section is still only 0.57 across, and a section that
  // small emerging is a POINT: the shoulder wore a little peak. Leaning the
  // root a unit inward holds it under the skin until s = -0.19, by which point
  // the section is 1.0 across and half as deep again, and what comes out of the
  // flank is a rounded swell. It is gone by the elbow and costs the shoulder
  // 0.16 of width at the joint.
  const ARM_ROOT_IN = 0.55;
  // THE ROOT IS BOUND TO THE ARM AND NOT SHARED WITH THE TORSO, AND THAT IS
  // MEASURED RATHER THAN ASSUMED.
  //
  // Sharing it is the textbook shoulder blend, and it is the first thing that
  // was tried here. It does not survive these poses. Linear blend skinning
  // shrinks whatever it mixes: blend a bone that has turned by theta with one
  // that has not, at w and 1-w, and a point d from the joint comes back at
  // d*sqrt(w^2 + (1-w)^2 + 2w(1-w)cos theta). At w = 0.5 that is 71% of itself
  // at 90 degrees -- survivable -- but 19% at 157, and 12_charanim's dive sets
  // the shoulder to -2.75 radians, which is 157. Driven through the real pose
  // the 50/50 ring lost 52% of its circumference: the shoulder necked in and
  // left a step where the arm came out of the body. Moving the hand-over onto
  // the joint, where d is smallest, only got that to 48%. Nothing weighted
  // survives a 157-degree single-joint blend; it wants a clavicle bone or dual
  // quaternions, and this rig has neither.
  //
  // Bound to the arm outright, the same eight poses cost 9% at worst, and that
  // 9% is at s = 0.257 -- the ELBOW, on a landing, where a limb is meant to
  // fold. The shoulder loses nothing. What pays for it is that the root swings
  // with the arm rather than staying with the body, and what makes that
  // affordable is the shape above: the root leans in and dies to a point, so
  // across all eight poses the furthest it ever gets out of the shell is 0.59
  // of a unit -- a knuckle of a swell on a figure 37 tall -- and in the two
  // poses that throw the arms overhead it stays buried.
  //
  // Putting both of these below ARM_S0 is what turns the blend off. They are
  // still here because the day this rig grows a shoulder bone, this is the knob.
  const ARM_BLEND0 = -0.500, ARM_BLEND1 = -0.450;
  // How much of the limb shares the elbow's turn, and the wrist's. See the note
  // in weights(): 0.20 either side of the elbow puts eight rings in the fold.
  const ELBOW_BLEND = 0.20, WRIST_BLEND = 0.22;
  // ...and the other end of the centreline is not straight either, because the
  // MITT is not on the axis. It is hung 0.55 below the wrist, 0.30 forward of
  // it and canted HAND_RZ outward, and a sleeve that ignores that stands 0.30
  // proud of the palm at the back while sitting 0.30 inside it at the front --
  // which is not a ring where the two meet, it is a seam running the whole
  // length of the hand. That was the V across the back of the mitt. So past the
  // wrist the sweep goes where the mitt goes.
  const HAND_DY = 0.55, HAND_DZ = 0.30, HAND_RZ = 0.11;
  // ---- v29c: THE FLESH SITS OUTBOARD OF THE BONE.
  //
  // With the joints where they are and armZ at its approved 0.23, the sweep's
  // centreline is the bone's axis, and the bone's axis is not where the
  // reference's arm is. Measured ring by ring against the reference's own idle
  // mask -- both arms compared at the same FRACTION OF THEIR OWN HEIGHT, which
  // is the only way to ask "where is the arm at this height" of two figures of
  // different size -- ours runs inboard of it the whole way: 0.6 of a unit at
  // the shoulder, 1.3 at the elbow, 2.1 at the wrist.
  //
  // That is not something a joint angle can fix without also getting the angle
  // wrong, so it is fixed where it belongs: the surface is offset outward along
  // the limb, leaving the skeleton exactly where it was. Soft flesh positioned
  // around a correct bone.
  //
  // One smoothstep, three numbers, fitted to the measured offset:
  //
  //      s      wanted   this curve
  //    0.13      0.59       0.50
  //    0.45      1.27       1.22
  //    0.65      1.56       1.62
  //    0.86      1.93       2.01
  //    0.97      2.15       2.13
  //
  // within 0.09 of a unit at every station, and it is 0.06 at s = -0.15 and
  // 0.0004 at the top of the root, so the buried shoulder does not move at all
  // and its blend into the bean is the one that was already approved.
  const ARM_BIAS = 2.15, ARM_BIAS_S0 = -0.28, ARM_BIAS_S1 = 1.05;
  const ARM_SEC_W = pchip(LIMB_SECTION.map(r=>r[0]), LIMB_SECTION.map(r=>r[1]));
  const ARM_SEC_D = pchip(LIMB_SECTION.map(r=>r[0]), LIMB_SECTION.map(r=>r[2]));

  function armGeometry(RIG, side, boneBody, boneArm, boneElbow, boneHand){
    const L = RIG.upperLen + RIG.foreLen;
    const ss = (a,b,x)=>{ const t = Math.max(0, Math.min(1, (x-a)/(b-a))); return t*t*(3-2*t); };
    const bow = (s)=> ARM_ROOT_Z * (1 - ss(ARM_S0, 0.34, s));
    // local +X is OUTWARD on the right and inward on the left, because the two
    // arms share one authored geometry and only their bones are mirrored
    const lean = (s)=> -side * ARM_ROOT_IN * (1 - ss(ARM_S0, 0.12, s));
    // ...and the same axis carries the outboard bias, which saturates by the
    // wrist and is held from there down so the sleeve and the mitt stay
    // concentric. The mitt is given the identical offset in handLocal below.
    const bias = (s)=>  side * ARM_BIAS * ss(ARM_BIAS_S0, ARM_BIAS_S1, s);
    // the mitt's own placement, faded in over the last ninth of the forearm so
    // the centreline arrives at it instead of stepping onto it
    const tipX = (s)=> side * Math.sin(HAND_RZ) * Math.max(0, s*L - L - HAND_DY);
    const tipZ = (s)=> HAND_DZ * ss(0.94, 1.05, s);
    // Rings, clustered where the section is turning -- through the root and
    // through the wrist. The straight of the forearm needs almost none.
    const RING_S = [];
    const span = (a,b,n)=>{ for(let i=0;i<n;i++) RING_S.push(a + (b-a)*i/n); };
    span(ARM_S0 + 0.004, 0.00, 11);   // the root
    span(0.00, 0.45,  7);             // the shoulder swell, easing out
    span(0.45, 0.90,  5);             // the straight of the forearm
    span(0.90, 1.294, 9);             // the wrist coming down to meet the palm
    span(1.294, 1.492, 6);            // the palm
    span(1.492, ARM_S1 - 0.003, 12);  // the lobes, which need the rings
    RING_S.push(ARM_S1 - 0.003);
    // 30 sides, not 16 -- the section is an ellipse now, so the curvature is
    // highest exactly where the silhouette edge is and facets show there first.
    // 30 and not 24 because that is what the MITT has: the two surfaces cross
    // inside the palm, and where two faceted tubes cross on different angular
    // grids the seam comes out scalloped. On the same grid it is a clean ring.
    // The rings the extra sides cost are taken back off the straight of the
    // forearm, which needs four and had six.
    const SEG = 30, pos = [], idx = [], si = [], sw = [];
    // Weights. wB is the torso's share of the root and is zero as shipped --
    // see ARM_BLEND0. The rest is the usual three-bone fall-off, which is what
    // lets one surface fold at two joints without showing where either of them
    // is; and past the wrist the HAND owns it outright, so the sweep and the
    // palm cannot come apart however the wrist turns.
    const weights = (s)=>{
      const wB = 1 - ss(ARM_BLEND0, ARM_BLEND1, s);
      // v30: A WIDER, SOFTER HAND-OVER AT THE ELBOW.
      //
      // The tent this replaces gave the elbow bone 100% of one station and fell
      // away linearly either side, so the whole bend happened across about two
      // rings and the fold came out as a corner with straight tube above and
      // below it -- the boomerang. Spreading the hand-over across 0.40 of the
      // limb puts eight rings in the fold instead of two: each one turns by a
      // little, the inside compresses gradually rather than creasing, and the
      // outside keeps its radius because no single ring is asked to carry the
      // whole angle. Smoothstep rather than linear so the weight has no corner
      // of its own either -- a kink in a weight is a kink in the surface.
      const tE = RIG.upperLen / L;
      const a0 = 1 - ss(tE - ELBOW_BLEND, tE + ELBOW_BLEND, Math.max(0, s));
      const h0 = ss(1.00 - WRIST_BLEND, 1.00 + WRIST_BLEND*0.4, s);
      const e0 = Math.max(0, 1 - a0 - h0), k = 1 - wB;
      si.push(boneBody, boneArm, boneElbow, boneHand);
      sw.push(wB, k*a0, k*e0, k*h0);
    };
    // The mitt is also ROLLED by HAND_RZ, which tips its rings out of the
    // horizontal; the sleeve's rings are rolled with it so the two stay
    // parallel where they cross.
    const roll = (s)=> Math.sin(HAND_RZ) * ss(0.94, 1.05, s) * side;
    // The mitt's two lobes: the front and the back of the tip are lifted, which
    // leaves a soft cleft either side. The same NOTCH the mitt always had,
    // and now applied as part of the same sweep rather than to a separate mesh.
    // v31: THREE lobes, not two. The old notch lifted the front and the back --
    // |sin a| to the fourth -- which leaves two lobes across the hand, and the
    // reference has three digits: two fingers and a thumb. Three lifted
    // sectors, started earlier so the clefts have room to open, and rolled by
    // the side so the thumb falls towards the body. Suggestions, not fingers:
    // the deepest cleft is a unit on a hand seven long.
    const lobe = (s, a)=>{
      const t = (s - HAND_S0)/HAND_SS, l = (t - 0.62)/0.32;
      if(!(l > 0)) return 0;
      const c = Math.cos(3*(a - side*0.55));
      return HAND_NOTCH * Math.pow(Math.max(0, c), 3) * Math.sin(Math.PI*Math.min(1,l));
    };
    const ring = (s, a, hw, hd)=>{
      const x = Math.cos(a)*hw, z = Math.sin(a)*hd;
      pos.push(x + tipX(s) + lean(s) + bias(s),
               -s*L + x*roll(s) + lobe(s, a),
               z + bow(s) + tipZ(s));
    };
    ring(ARM_S0, 0, 0, 0); weights(ARM_S0);                 // root apex, in the bean
    for(const s of RING_S){
      const hw = ARM_SEC_W(s), hd = ARM_SEC_D(s);
      for(let k=0;k<SEG;k++){ ring(s, k/SEG*Math.PI*2, hw, hd); weights(s); }
    }
    ring(ARM_S1, 0, 0, 0); weights(ARM_S1);                 // the fingertip
    const first = 1, last = 1 + RING_S.length*SEG;
    // BOTH FANS ARE WOUND WITH THE BODY, the same correction the lower limb
    // got in v32b. The quads below walk a ring k -> k+1 on their leading edge,
    // so a cap that also walks k -> k+1 is wound the other way round from the
    // surface it closes. That put a back-facing lid on the mitt's tip -- sixty
    // triangles the camera saw straight through, which is the white speck at
    // the fingertip in every action sheet since v30. Reversed, both ends.
    // Nothing else moves: not one vertex, radius, weight or station, only the
    // order three indices are written in, and computeVertexNormals now averages
    // them with the surface instead of against it.
    for(let k=0;k<SEG;k++){                                  // fan into the root apex
      const k2 = (k+1)%SEG;
      idx.push(0, first+k2, first+k);
    }
    for(let j=0;j<RING_S.length-1;j++){
      const a0 = first + j*SEG, b0 = first + (j+1)*SEG;
      for(let k=0;k<SEG;k++){
        const k2 = (k+1)%SEG;
        idx.push(a0+k, b0+k2, b0+k);
        idx.push(a0+k, a0+k2, b0+k2);
      }
    }
    const t0 = first + (RING_S.length-1)*SEG;
    for(let k=0;k<SEG;k++){                                  // fan into the tip apex
      const k2 = (k+1)%SEG;
      idx.push(last, t0+k, t0+k2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    // The mitt has no geometry of its own to measure any more, so the hidden
    // probe check 5 takes a box round is cut from this sweep instead: the rings
    // at and below the wrist, moved into the HAND bone's own space. It cannot
    // drift from the hand, because it IS the hand.
    const hp = [];
    for(let j=0;j<RING_S.length;j++){
      if(RING_S[j] < HAND_S0) continue;
      for(let k=0;k<SEG;k++){
        const v = (1 + j*SEG + k)*3;
        hp.push(pos[v], pos[v+1] + L, pos[v+2]);
      }
    }
    hp.push(pos[last*3], pos[last*3+1] + L, pos[last*3+2]);
    const hg = new THREE.BufferGeometry();
    hg.setAttribute('position', new THREE.Float32BufferAttribute(hp, 3));
    return { geo:g, handProbe:hg,
             weights:{ si:new Uint16Array(si), sw:new Float32Array(sw) } };
  }

  // v30: handGeometry() is gone. The mitt is the tail of LIMB_SECTION and is
  // built by armGeometry as part of the same sweep, so there is exactly one
  // statement of the hand's shape and exactly one surface carrying it.

  // ---- v32: THE LOWER LIMB, ONE SURFACE, BELLY TO TOE --------------------
  //
  // v31 built a leg and a foot and let them intersect. That is the same fault
  // the wrist had for three versions and it has the same answer: two closed
  // shells that interpenetrate ALWAYS show their intersection curve, and they
  // are normalled independently either side of it. Flaring the leg into the
  // heel made the step shallower; it could not make it go away.
  //
  // So there is no foot object. There is a centreline that runs down the leg,
  // BENDS FORWARD THROUGH THE ANKLE on a quarter circle, and carries on to the
  // toe -- and one cross-section swept along it, from an apex inside the belly
  // to an apex at the toe. One surface, one computeVertexNormals, no ankle.
  //
  // The frame turns with the centreline, which is what makes this work: while
  // the tangent points down the section lies flat and its second axis is DEPTH,
  // and once the tangent points forward the same section stands up and that
  // axis is HEIGHT. A leg's cross-section and a foot's cross-section are the
  // same ellipse seen in two different planes.
  //
  // ---- v32b: THE TWO DEFECTS THAT SHIPPED IN v32 -------------------------
  //
  // 1. THE WHITE SLOT ON THE TOP OF THE FOOT WAS THE TOE, NOT THE ANKLE. Both
  //    apex fans were wound against the body they close, so the toe's cap was
  //    twenty-four back-facing triangles -- and a back-facing cap on a FrontSide
  //    material is a hole you see straight through. Both fans are wound with the
  //    body now. (The arm sweep has the same inverted fans and has shipped with
  //    them since v30. It is frozen; that is a separate cleanup.)
  //
  // 2. THE ANKLE FOLDED. A section of half-depth h swept along an arc of radius
  //    R advances at (1 - h/R) on the INSIDE of the turn, so at h = R it stands
  //    still and past it the rings run backwards through each other. v32 turned
  //    on R 1.49 with the section still 1.68 deep where the turn starts -- an
  //    inner radius of MINUS 0.19.
  //
  //    Opening the radius alone cannot be paid for: the turn drops the
  //    centreline by exactly R, so the sole sits at (ARC_U + R + half-height)
  //    and every unit of radius is a unit of sole. So the section comes OFF the
  //    centre of the turn instead. What folds the surface is not how deep the
  //    limb is, it is how far it reaches PAST the centre of curvature; sliding
  //    the section backwards along its own depth axis pulls the inner wall in
  //    without one unit of depth leaving the limb, and costs no sole at all
  //    because the bias is back to zero by the time the turn ends.
  //
  // ---- v33: THE FOOT, FITTED TO THE REFERENCE'S OWN SILHOUETTE -----------
  //
  // v32b's topology was approved and its foot was not: in side view it read as
  // a hook into a rounded, upturned slipper. Measured against the reference's
  // own outline, scaled to our height and laid over ours sole-to-sole and
  // ankle-to-ankle, three things were wrong and all three are numbers:
  //
  //    THE SOLE WAS A ROCKER. The reference's underside is flat -- dead flat,
  //    at zero, from z -2.0 to z +5.0. v32b's rose behind the ball: 0.28 above
  //    the ground at the ankle, 1.33 half a unit behind it, 2.44 at the heel.
  //    That curve IS the hook. It is what a section swept round a turn does
  //    when it is centred on the turn: the outer wall traces an arc of radius
  //    (R + half-depth) and lifts away from the floor. Pushing the bias hard
  //    negative through the bend walks that outer wall back down onto the floor
  //    and holds it there, and the inner wall -- which is the front of the shin
  //    and the top of the ankle, and which was approved -- does not move.
  //
  //    THE FOREFOOT WAS A SLAB. v32b held half the height at 1.20 from the
  //    ankle to the ball and then tapered it symmetrically, so the top ran flat
  //    and the sole curled up to meet it: the end of a capsule. The reference's
  //    top falls steadily from 2.14 at z 2.75 to 0.94 at z 5.0 over a sole that
  //    never leaves the floor. That is a wedge, and a wedge is an asymmetric
  //    section: the height comes off the TOP only, which is bias and half-height
  //    moving together.
  //
  //    THE FOOT WAS TOO LONG AND TOO FAR INBOARD. The toe reached z 6.70
  //    against the reference's 5.33, and the rest splay swings the ankle inward
  //    so the two feet met at the midline -- inner edges 0.01 apart against the
  //    reference's 1.52, which is what made them read as one central blob. The
  //    sweep is shortened, and the section is given a lateral shift, outboard,
  //    that eases in across the turn. The HIP does not move: legX is still 3.00
  //    and the shin still hangs where it hung. It is the foot that steps out,
  //    which is what the reference's does too -- its own limb walks from x 3.05
  //    at the shin to 3.44 at the sole.
  //
  // Every row of the table below was measured, not chosen. For each ring the
  // posed centreline and the posed direction of that ring's depth axis were
  // computed, the reference's outline was read along that axis, and the ring's
  // numbers were corrected towards it until they stopped moving. The result was
  // then thinned from one row per ring to these eleven, which is the fewest that
  // holds the whole surface within 0.04 of the fitted one.
  //
  // What it costs: the underside now sits within 0.05 of the reference's from
  // the heel to the toe (it was out by up to 2.44), the instep within 0.17 from
  // z 2.75 forward, the toe and heel within 0.1, and the inner-edge spacing is
  // 1.44 against 1.52. The inner clearance through the bend is UNCHANGED at
  // 0.42, because none of this touched the inner wall of the turn.
  const LEG_KNEE_PITCH = -0.13;   // see below: the rest knee angle, cancelled
  const LEG_ARC_U = 1.90;         // where the centreline starts to turn
  const LEG_ARC_R = 2.60;         // ...on this radius, so it levels out at 5.98
  const LEG_END_U = 8.53;         // and runs to here, which is the toe
  const LEG_ARC_END = LEG_ARC_U + LEG_ARC_R*Math.PI/2;
  // u is distance ALONG the centreline from the hip bone.
  //   halfB is DEPTH up the leg and HEIGHT in the foot. bias slides the section
  //   along that same axis, negative being AWAY from the centre of the turn --
  //   backwards up the leg, downwards in the foot. xout slides it OUTBOARD,
  //   away from the midline on whichever leg it is.
  //         u    halfW  halfB   bias   xout
  const LIMB2_SECTION = [
    [-2.30,  0.25,  0.25,  0.00,  0.00],   // apex, inside the belly
    [-1.40,  1.80,  1.78,  0.00,  0.00],
    [ 0.00,  2.44,  2.40,  0.00,  0.00],   // the hip   ) the approved v31 leg,
    [ 1.70,  2.06,  2.04,  0.00,  0.00],   // the knee  ) frozen
    [ 1.90,  1.98,  1.92,  0.11,  0.01],   // the turn starts, and the front face
                                           // is where the thigh's already is --
                                           // 2.03 against the thigh's 2.09. The
                                           // clearance cap is ABOVE it now, so
                                           // there is no step onto it at all.
    [ 2.92,  1.84,  2.23, -0.18,  0.18],   // through the bend the bias runs out
    [ 3.26,  1.83,  2.33, -0.26,  0.28],   // and walks the heel back and DOWN
    [ 3.60,  1.83,  2.23, -0.16,  0.38],   // onto the floor rather than round an
    [ 3.94,  1.82,  1.98,  0.10,  0.49],   // arc above it
    [ 4.62,  1.83,  1.55,  0.52,  0.69],
    [ 5.64,  1.90,  1.25,  0.73,  0.89],   // the turn is done; halfB is half the
                                           // HEIGHT from here, and the foot has
                                           // stepped its full 0.91 outboard
    [ 5.98,  2.01,  1.17,  0.70,  0.91],
    [ 6.18,  2.40,  1.07,  0.61,  0.91],
    [ 6.38,  2.57,  0.95,  0.49,  0.90],   // the ball, broadest
    [ 6.58,  2.60,  0.82,  0.36,  0.89],   // ...and from here the height comes
    [ 7.17,  2.42,  0.53,  0.07,  0.84],   // off the TOP: halfB and bias fall
    [ 7.70,  2.14,  0.36, -0.11,  0.83],   // together, so the sole stays flat
    [ 8.53,  0.80,  0.19, -0.28,  0.77],   // and the top slopes to the toe
  ];
 const L2_W = pchip(LIMB2_SECTION.map(r=>r[0]), LIMB2_SECTION.map(r=>r[1]));
  const L2_B = pchip(LIMB2_SECTION.map(r=>r[0]), LIMB2_SECTION.map(r=>r[2]));
  const L2_D = pchip(LIMB2_SECTION.map(r=>r[0]), LIMB2_SECTION.map(r=>r[3]));
  const L2_X = pchip(LIMB2_SECTION.map(r=>r[0]), LIMB2_SECTION.map(r=>r[4]));

  function lowerLimbGeometry(RIG, side, boneLeg, boneKnee, boneFoot){
    const ss = (a,b,x)=>{ const t=Math.max(0,Math.min(1,(x-a)/(b-a))); return t*t*(3-2*t); };
    const ARC_LEN = LEG_ARC_R*Math.PI/2;
    // the centreline and its tangent, in the LEG bone's space
    const path = (u)=>{
      if(u <= LEG_ARC_U) return { p:[0,-u,0], t:[0,-1,0] };
      const a = Math.min(u - LEG_ARC_U, ARC_LEN)/LEG_ARC_R;
      const p = [0, -LEG_ARC_U - LEG_ARC_R*Math.sin(a), LEG_ARC_R*(1-Math.cos(a))];
      const t = [0, -Math.cos(a), Math.sin(a)];
      const over = (u - LEG_ARC_U) - ARC_LEN;
      if(over > 0){ p[1] += t[1]*over; p[2] += t[2]*over; }
      return { p, t };
    };
    // THE KNEE'S REST BEND, CANCELLED IN THE BIND GEOMETRY.
    // Everything below the knee turns about the knee by REST.kneeX, and a foot
    // that genuinely projects forward is a long way from that centre, so it
    // swings DOWN -- v31 measured 1.4 of drop and the foot tore off the leg.
    // v31 paid for that with a world-space lift on footDY. Here the sub-knee
    // part of the centreline is authored pre-rotated by the same angle instead,
    // so the rest pose puts it exactly where the table says. No constant.
    const KN = RIG.thighLen, c = Math.cos(LEG_KNEE_PITCH), sn = Math.sin(LEG_KNEE_PITCH);
    const bend = (v)=>{
      const y = v[1] + KN;                       // turn about the knee
      return [v[0], (y*c - v[2]*sn) - KN, y*sn + v[2]*c];
    };
    const SEG = 24, pos = [], idx = [], si = [], sw = [];
    // rings: dense through the turn and the toe, sparse up the straight. The
    // turn gets its own span, twelve rings starting at its first unit -- v32's
    // leg span ran past the turn's start and stepped over the first sixth of
    // the bend, which is precisely where the section was pinching.
    const U = [];
    const span = (a,b,n)=>{ for(let i=0;i<n;i++) U.push(a+(b-a)*i/n); };
    const BALL = LEG_ARC_END + (LEG_END_U - LEG_ARC_END)*0.62;
    span(-2.26, 0.00, 7);
    span( 0.00, LEG_ARC_U,  6);
    span( LEG_ARC_U, LEG_ARC_END, 12);   // the turn
    span( LEG_ARC_END, BALL, 8);
    span( BALL, LEG_END_U, 7);
    U.push(LEG_END_U);
    const weights = (u)=>{
      const a0 = 1 - ss(KN-0.85, KN+0.85, u);
      const h0 = ss(LEG_ARC_U-0.95, LEG_ARC_U+0.95, u);
      si.push(boneLeg, boneKnee, boneFoot, 0);
      sw.push(a0, Math.max(0, 1-a0-h0), h0, 0);
    };
    // the section is round up the leg and squares off into the foot, which is
    // what gives it a sole instead of the underside of an oval
    const sq = (u)=> 1 - 0.26*ss(2.60, LEG_ARC_END + 0.35, u);
    const se = (v,e)=> (v<0?-1:1)*Math.pow(Math.abs(v), e);
    const ring = (u, a)=>{
      const P = path(u), hw = L2_W(u), hb = L2_B(u), e = sq(u);
      const t = P.t;
      // B = t x (1,0,0): (0,-1,0) -> (0,0,1) up the leg, (0,0,1) -> (0,1,0) in
      // the foot. The bias rides the same axis, so it is a backward shift up
      // the leg and a downward one in the foot.
      const By = t[2], Bz = -t[1], off = L2_D(u) + hb*se(Math.sin(a), e);
      const q = [ P.p[0] + side*L2_X(u) + hw*se(Math.cos(a), e),
                  P.p[1] + By*off,
                  P.p[2] + Bz*off ];
      const r = u > KN ? bend(q) : q;
      pos.push(r[0], r[1], r[2]);
    };
    const apex = (u)=>{ const P = path(u), d = L2_D(u), t = P.t;
                        const q = [P.p[0] + side*L2_X(u), P.p[1] + t[2]*d, P.p[2] - t[1]*d];
                        const r = u > KN ? bend(q) : q;
                        pos.push(r[0], r[1], r[2]); weights(u); };
    apex(-2.34);
    for(const u of U){ for(let k=0;k<SEG;k++){ ring(u, k/SEG*Math.PI*2); weights(u); } }
    apex(LEG_END_U + 0.22);
    const first = 1, last = 1 + U.length*SEG;
    // BOTH FANS ARE WOUND WITH THE BODY. The quads below walk a ring k -> k+1
    // on their leading edge, so a cap that also walks k -> k+1 is wound the
    // other way round from the surface it closes; that is what put a
    // back-facing lid on the toe and a hole in it. Reversed, both ways.
    for(let k=0;k<SEG;k++){ const k2=(k+1)%SEG; idx.push(0, first+k2, first+k); }
    for(let j=0;j<U.length-1;j++){
      const a0 = first+j*SEG, b0 = first+(j+1)*SEG;
      for(let k=0;k<SEG;k++){ const k2=(k+1)%SEG;
        idx.push(a0+k, b0+k2, b0+k); idx.push(a0+k, a0+k2, b0+k2); }
    }
    const t0 = first + (U.length-1)*SEG;
    for(let k=0;k<SEG;k++){ const k2=(k+1)%SEG; idx.push(last, t0+k, t0+k2); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx); g.computeVertexNormals();
    // the hidden foot the rig check measures, cut from this same sweep and put
    // into the FOOT bone's space. It cannot drift from the foot; it IS the foot.
    const fp = [];
    for(let j=0;j<U.length;j++){
      if(U[j] < LEG_ARC_U) continue;
      for(let k=0;k<SEG;k++){ const v=(1+j*SEG+k)*3;
        fp.push(pos[v], pos[v+1] + KN + RIG.shinLen, pos[v+2]); }
    }
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3));
    return { geo:g, footProbe:fg,
             weights:{ si:new Uint16Array(si), sw:new Float32Array(sw) } };
  }

  function limbGeometry(r, len, rTip){
    const g = new THREE.CylinderGeometry(r, rTip||r*0.94, len, 16);
    g.translate(0, -len/2, 0);
    return g;
  }

  function makeCharacter(opts){
    const skin = opts.skin ? opts.skin : {id:'_flat', type:'solid', color:opts.color||'#ff4fa3'};
    const pattern = opts.pattern || null;
    const group = new THREE.Group();
    const { bodyMat, limbMat } = makeSkinMaterials(skin, pattern);
    const limbCol = limbMat.color;

    // ---- bones. Positions are the positions the old Groups had, so the
    //      animation code's absolute rotations mean exactly what they meant.
    const bones = [];
    const bone = (i, parent, x, y, z)=>{
      const b = new THREE.Bone(); b.position.set(x||0, y||0, z||0);
      bones[i] = b; (parent===null ? group : bones[parent]).add(b); return b;
    };
    const tilt = bone(BONE.tilt, null, 0, 0, 0);   // pitch pivot, inside the yaw group
    const bodyBone = bone(BONE.body, BONE.tilt, 0, 0, 0);
    const legL = bone(BONE.legL, BONE.tilt, -RIG.legX, RIG.hipY, 0);
    const legR = bone(BONE.legR, BONE.tilt,  RIG.legX, RIG.hipY, 0);
    const armL = bone(BONE.armL, BONE.tilt, -RIG.shoulderX, RIG.shoulderY, 0);
    const armR = bone(BONE.armR, BONE.tilt,  RIG.shoulderX, RIG.shoulderY, 0);
    // v25: the second segment of each limb hangs off the end of the first, so
    // a rotation on the knee bends the leg instead of shearing it. Every one of
    // these stands at the END of its parent (0, -parentLength, 0), which is why
    // the animation can treat them as plain hinge angles.
    const kneeL = bone(BONE.kneeL, BONE.legL, 0, -RIG.thighLen, 0);
    const kneeR = bone(BONE.kneeR, BONE.legR, 0, -RIG.thighLen, 0);
    const footL = bone(BONE.footL, BONE.kneeL, 0, -RIG.shinLen, 0);
    const footR = bone(BONE.footR, BONE.kneeR, 0, -RIG.shinLen, 0);
    const elbowL = bone(BONE.elbowL, BONE.armL, 0, -RIG.upperLen, 0);
    const elbowR = bone(BONE.elbowR, BONE.armR, 0, -RIG.upperLen, 0);
    const handL = bone(BONE.handL, BONE.elbowL, 0, -RIG.foreLen, 0);
    const handR = bone(BONE.handR, BONE.elbowR, 0, -RIG.foreLen, 0);
    const head = bone(BONE.head, BONE.tilt, 0, 0, 0);
    const faceGroup = bone(BONE.face, BONE.head, 0, RIG.faceY, 0);

    const FS = RIG.faceR/7.0;                       // everything on the face scales with it
    // v26: the eyes came in at 0.45 of a faceR that was 6.4. At 7.2 that put
    // them through the panel's edge. Narrower spacing on a bigger plate is what
    // leaves the margin a face needs to read as a face.
    const eyeX = 2.36;   // reference eye spacing, 0.129 of height
    const eyes = opts.eyes||'round';
    // EYES JUST ABOVE THE PLATE'S CENTRE, MOUTH BELOW IT. Every one of these
    // sits ON the cap: `faceOn` gives the z that puts a feature on the curve at
    // that height, so nothing is left floating in front of the middle of the
    // face or sunk into its edge.
    const EYE_DY = -1.52*FS, MOUTH_DY = -2.45*FS;
    const eyeAt = faceOn(EYE_DY, eyeX);
    const scleras = [ bone(BONE.scleraL, BONE.face, -eyeX, EYE_DY, eyeAt.z-0.25),
                      bone(BONE.scleraR, BONE.face,  eyeX, EYE_DY, eyeAt.z-0.25) ];
    // the pupil sits where its expression puts it; the locker's look-at moves
    // it from there, so the bone has to stand at the rest position
    const pupilDY = EYE_DY + (eyes==='happy' ? 0.40*FS : eyes==='sleepy' ? -0.30*FS : 0);
    const pupilAt = faceOn(pupilDY, eyeX);
    const pupils = [ bone(BONE.pupilL, BONE.face, -eyeX, pupilDY, pupilAt.z),
                     bone(BONE.pupilR, BONE.face,  eyeX, pupilDY, pupilAt.z) ];
    const tongueAt = faceOn(MOUTH_DY - 1.5*FS, 0);
    const tongue = bone(BONE.tongue, BONE.face, 0, tongueAt.y, tongueAt.z - 0.15);
    tongue.scale.setScalar(0.0001);                 // only the locker's gurn shows it

    const hat = opts.hat||'none';
    const hatGroup = bone(BONE.hat, BONE.head, 0, RIG.topY - 1.2, 0);
    hatGroup.scale.setScalar(RIG.hatScale);
    // THE CROWN LEANS BACK. Its five points are the one hat that reads as
    // pointing INTO the face from the lobby camera even with the band clear
    // above the plate, because the camera looks slightly down. A small pitch
    // takes the points away from the eyes and looks worn rather than balanced.
    // Set before the bind pose is taken, so it is baked in with everything else
    // rather than being a rotation the animation code has to remember.
    if(hat==='crown') hatGroup.rotation.x = -0.15;
    // the only hat with a moving part of its own
    const hatSpin = bone(BONE.hatSpin, BONE.hat, 0, hat==='prop' ? 8.7 : 0, 0);

    group.updateMatrixWorld(true);                  // bind pose, group at identity
    const skeleton = new THREE.Skeleton(bones);

    // ---- the parts. `at` bakes a part into the bind pose of its bone.
    const parts = [];
    const at = (boneIndex, geo, color, local, colorAt)=>{
      if(local) geo.applyMatrix4(local);
      geo.applyMatrix4(bones[boneIndex].matrixWorld);
      parts.push({ geo, bone:boneIndex, color, colorAt });
      return geo;
    };
    const xf = (px,py,pz, sx,sy,sz, rz, ry)=>{
      const m = new THREE.Matrix4(), q = new THREE.Quaternion();
      q.setFromEuler(new THREE.Euler(0, ry||0, rz||0));
      return m.compose(new THREE.Vector3(px||0,py||0,pz||0), q,
                       new THREE.Vector3(sx===undefined?1:sx, sy===undefined?1:sy, sz===undefined?1:sz));
    };
    const DARK = new THREE.Color(0x1a1033), WHITE = new THREE.Color(0xfdfdff),
          RIM  = new THREE.Color(0x2b1a4d);

    // A hidden copy of a part, in the same place, so a check can still take a
    // bounding box round something that has been merged away. Same trick the
    // feet and hands already use, and the same reason: after the merge there is
    // one geometry for the whole trim mesh and no way to ask it where the face
    // is. Clone BEFORE `at` touches the geometry — `at` bakes the transforms
    // into it in place, so a probe made afterwards would be double-transformed.
    const probeOf = (boneIndex, geo, local)=>{
      const p = new THREE.Mesh(geo.clone(), limbMat);
      if(local) p.applyMatrix4(local);
      p.visible = false;
      bones[boneIndex].add(p);
      return p;
    };
    const hatProbes = [];
    let mouthProbe = null;

    // The shoe and the cuff are the limb colour taken down and up a step. Two
    // shades off one colour, so a skin that sets a limb colour gets footwear
    // that matches it without the skin having to know footwear exists.
    const shoeCol = limbCol.clone().multiplyScalar(0.66);
    const cuffCol = limbCol.clone().lerp(new THREE.Color(0xffffff), 0.34);

    // ---- legs: thigh, knee, shin, and a chunky shoe on the end.
    // A ball at the knee and the ankle, sized to the segment that meets it, is
    // what keeps a bent leg from showing the open end of a cylinder. It costs
    // two small spheres and it is the whole difference between "jointed" and
    // "two sticks that happen to touch".
    const feet = [];
    [[BONE.legL,BONE.kneeL,BONE.footL,-1],[BONE.legR,BONE.kneeR,BONE.footR,1]]
    .forEach(([li,ki,fi,s])=>{
      // The joint balls are still here and still close a bent limb, but they
      // are now the SAME radius as the segments either side of them, so they
      // read as the limb continuing rather than as a knuckle in it. That is
      // the whole difference between a rig you can see and a rig you cannot.
      // v32: ONE part for the whole lower limb. There is no foot mesh and no
      // ankle: the sweep turns forward through it and carries on to the toe.
      const G = lowerLimbGeometry(RIG, s, li, ki, fi);
      G.geo.applyMatrix4(bones[li].matrixWorld);
      parts.push({ geo:G.geo, bone:li, color:limbCol, weights:G.weights });
      const probe = new THREE.Mesh(G.footProbe, limbMat);
      probe.visible = false;
      bones[fi].add(probe); feet.push(probe);
      // v26: no sole slab. A second shade under the foot is a seam, and the
      // foot is small enough now that it only broke the silhouette up.
    });

    // ---- arms: shoulder, elbow, forearm, mitt.
    const hands = [];
    [[BONE.armL,BONE.elbowL,BONE.handL,-1],[BONE.armR,BONE.elbowR,BONE.handR,1]]
    .forEach(([ai,ei,hi,s])=>{
      // ONE SURFACE, TORSO TO FINGERTIP. v30: the mitt is no longer a second
      // mesh hung off the wrist and overlapped into this one -- it is the last
      // third of this sweep. Two closed surfaces that interpenetrate ALWAYS show
      // their intersection curve, however well their sections are matched, and
      // they are normalled independently either side of it; that curve was the
      // ring line at the wrist, and no amount of shape work was going to remove
      // it. There is nothing to intersect now. Nothing else goes on the arm --
      // no ball, no ring, no cuff, and no end at either end of it.
      const A = armGeometry(RIG, s, BONE.body, ai, ei, hi);
      A.geo.applyMatrix4(bones[ai].matrixWorld);
      parts.push({ geo:A.geo, bone:ai, color:limbCol, weights:A.weights });
      // The hidden mitt the rig check measures, cut from that same sweep.
      const probe = new THREE.Mesh(A.handProbe, limbMat);
      probe.visible = false;
      bones[hi].add(probe); hands.push(probe);
      // no separate thumb bead: the paddle's lobes carry the hand's front now
    });

    // ---- the suit: a collar, a belt, and our own mark on the chest.
    // Every one of these takes its size from BEAN_PROFILE rather than carrying
    // a copy of a width, so changing the silhouette moves the suit with it --
    // the lesson the face learned in v24 §6, applied before it can go wrong.
    const ring = (y, tube, col)=>{
      const g = new THREE.TorusGeometry(beanRadiusAt(y) + tube*0.30, tube, 5, 16);
      g.rotateX(Math.PI/2);                       // a torus lies in XY; lay it flat
      g.translate(0, y, 0);
      at(BONE.body, g, col);
    };
    if(!RIG.plainBody){
      ring(RIG.collarY, RIG.collarR, cuffCol);    // under the head, in the pinch
      ring(RIG.beltY,   RIG.beltR,   shoeCol);    // on the hips
    }

    // THE MARK. Two chevrons leaning into the run, on a rounded badge: it is a
    // speed mark, it is ours, and it is four boxes and a cap. Deliberately not
    // a face-like shape, a letter, or anything borrowed -- the brief asks for a
    // Scramble Rush emblem and this is the cheapest thing that is one.
    if(!RIG.plainBody){
    const EM_R = beanRadiusAt(RIG.emblemY) + RIG.emblemProud;
    const badge = capGeometry(EM_R, RIG.emblemHalfW, RIG.emblemHalfH, 12, 9);
    badge.translate(0, RIG.emblemY, 0);
    at(BONE.body, badge, DARK);
    const chevron = (dy, span, thick, col)=>{
      [-1, 1].forEach(sx=>{
        const g = new THREE.BoxGeometry(span, thick, 0.40);
        const px = sx*span*0.40;
        const pt = capOn(EM_R, dy, px, 0.14);
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(pt.pitch, 0, -sx*0.60));
        g.applyMatrix4(new THREE.Matrix4().compose(
          new THREE.Vector3(px, RIG.emblemY + dy, pt.z), q, new THREE.Vector3(1,1,1)));
        at(BONE.body, g, col);
      });
    };
    chevron( 0.62, 2.5, 0.58, WHITE);
    chevron(-0.72, 2.5, 0.58, WHITE);
    }

    // ---- face. A wide oval on the upper third of the body, curved like the
    //      body so it sits on the surface rather than cutting a flat dish.
    //      The dark hairline behind it used to be a back-facing shell; in one
    //      merged mesh every triangle faces the same way, so it is now a
    //      slightly larger plate set far enough back to show only at the edge.
    // The dark rim: the same cap a shade smaller in radius and a shade wider in
    // angle, so it shows as a thin outline round the plate and closes the seam
    // at a grazing angle. It cannot float, because it is concentric with the
    // plate rather than pushed back along z.
    // v26: no rim cap. Two concentric caps that have both been bent from a
    // square onto a disc do not end on the same curve, and what showed was a
    // scalloped edge along the bottom of the plate. A clean oval needs no
    // outline drawn round it.
    // the rim sits BEHIND the plate and reaches a little wider, so only its
    // edge shows as a soft border. Drawn proud it is a filled cap, and a
    // filled cap in front of the panel simply hides the panel.
    // NO rim cap. A filled cap a hair behind the plate z-fights with it and
    // renders as a dashed ring -- the 'pasted-on disc with an outline' read.
    // The reference's rim is only a soft crease, so the panel's own edge plus
    // the shell's baked shading carries it.
    const plateGeo = faceCapGeometry(FACE_R3, 1);
    const facePlate = probeOf(BONE.face, plateGeo);
    at(BONE.face, plateGeo, WHITE);

    // ---- eyes: two dots on the plate, shaped by the chosen expression
    // v26: smaller and rounder. A tall 1.55 oval on a 9.6-high panel filled it
    // corner to corner and read as two slabs; a round dot with margin round it
    // is what makes a face legible at tile size.
    const dotScale = eyes==='happy'  ? [1.30, 0.50, 0.45]
                   : eyes==='sleepy' ? [1.40, 0.26, 0.45]
                   :                   [1.00, 1.10, 0.16];
    [[BONE.scleraL, BONE.pupilL, -1],[BONE.scleraR, BONE.pupilR, 1]].forEach(([sb,pb,s],i)=>{
      // the "sclera" slot is kept so the idle blink still has something to squash
      // v26b: the eyes were spheres standing off the plate, and at this size
      // that is all you saw. Flattened to 0.14 of their depth they sit in the
      // panel instead of in front of it.
      // no sclera bead: the reference has a dark slot, not an eyeball
      // A little bigger than v22's 2.0: at tile size the old dot read as a
      // pinprick, and the highlight below needs something to sit on.
      at(pb, new THREE.SphereGeometry(0.72*FS, 18, 14), DARK,
         xf(0,0,0, dotScale[0]*0.92, dotScale[1]*1.80, dotScale[2]*0.55));
      // OUR OWN EYE, not a copy of anyone's: one small catchlight, top-left on
      // both eyes because a single light source does not mirror itself. On the
      // pupil bone, so it tracks the locker's look-at instead of sliding off.
      // v26b: flattened and pulled back to match. The pupil is 0.16 deep now,
      // so a full-depth catchlight sat proud of it as a separate white bead.
      at(pb, new THREE.SphereGeometry(0.72*FS*0.15, 8, 6), WHITE,
         xf(-0.15*FS, 0.50*FS, 0.12*FS, 1, 1.2, 0.35));
      if(eyes==='angry'){
        const browAt = faceOn(2.9*FS, s*eyeX);
        at(BONE.face, new THREE.BoxGeometry(3.4*FS, 1.0*FS, 0.7), DARK,
           xf(s*eyeX, browAt.y, browAt.z - 0.15, 1,1,1, i===0 ? -0.42 : 0.42));
      }
    });

    // ---- the mouth. A curved bar lying on the cap, shaped by the expression:
    //      a small smile at rest, a wide grin for happy, a nearly flat line for
    //      sleepy, and the one case that turns over -- angry frowns.
    //      A torus arc rather than a painted texture, because the whole face is
    //      geometry on one merged mesh and a second material would be a third
    //      draw call per racer.
    const MOUTH = eyes==='happy'  ? { r:2.95*FS, tube:0.42*FS, arc:Math.PI*1.00, down:true }
                : eyes==='sleepy' ? { r:5.00*FS, tube:0.30*FS, arc:Math.PI*0.30, down:true }
                : eyes==='angry'  ? { r:2.40*FS, tube:0.38*FS, arc:Math.PI*0.62, down:false }
                :                   { r:2.05*FS, tube:0.36*FS, arc:Math.PI*0.78, down:true };
    {
      const mAt = faceOn(MOUTH_DY, 0, 0.10);
      // TorusGeometry draws its arc from angle 0, which is the UPPER half of the
      // ring. Turning it half a turn about z brings that arc to the bottom and
      // makes it a smile; leaving it alone is a frown, which is the whole of
      // `down`.
      const mm = new THREE.Matrix4()
        .makeTranslation(0, mAt.y, mAt.z)
        .multiply(new THREE.Matrix4().makeRotationX(mAt.pitch))
        .multiply(new THREE.Matrix4().makeRotationZ(MOUTH.down ? Math.PI : 0))
        // the arc is centred on the face rather than starting at one corner
        .multiply(new THREE.Matrix4().makeRotationZ(-MOUTH.arc/2 + Math.PI/2));
      const mouthGeo = new THREE.TorusGeometry(MOUTH.r, MOUTH.tube, 6, 14, MOUTH.arc);
      const mouth = probeOf(BONE.face, mouthGeo, mm);
      // v26 approval pass: the shape is what is being judged, so the face is
      // neutral -- no mouth. The probe stays so anything measuring a mouth
      // still has one to measure; only the drawn geometry goes.
      if(!RIG.neutralFace) at(BONE.face, mouthGeo, DARK, mm);
      mouthProbe = mouth;
    }

    // ---- cheeks: the skin colour a step darker, blended most of the way into
    //      the plate so it reads as a blush rather than a sticker. There is no
    //      opacity to spend -- one opaque merged mesh -- so the 60% is mixed
    //      into the vertex colour instead.
    if(!RIG.neutralFace) {
      const cheekCol = WHITE.clone().lerp(limbCol.clone().multiplyScalar(0.82), 0.60);
      for(const s of [-1, 1]){
        const cAt = faceOn(MOUTH_DY + 0.55*FS, s*3.55*FS, 0.06);
        at(BONE.face, new THREE.SphereGeometry(1.05*FS, 8, 6), cheekCol,
           xf(s*3.55*FS, cAt.y, cAt.z, 1, 0.78, 0.30));
      }
    }

    // The tongue only shows in the locker's gurn.
    at(BONE.tongue, new THREE.SphereGeometry(1.3*FS,6,5),
       new THREE.Color(0xff4fa3), xf(0,0,0, 1,0.65,0.45));

    // ---- hat, on the crown. Scaled down: these were sized for a separate head.
    const GOLD = new THREE.Color(0xffcb3d);
    // Every hat part is probed as it is added, so check 5b can box each one
    // against the face without knowing which hat is on.
    const atHat = (boneIndex, geo, color, local, colorAt)=>{
      hatProbes.push(probeOf(boneIndex, geo, local));
      return at(boneIndex, geo, color, local, colorAt);
    };
    if(hat==='crown'){
      atHat(BONE.hat, new THREE.CylinderGeometry(7,5.8,6,5,1,false), GOLD, xf(0,3.0,0));
      for(let i=0;i<5;i++){
        const a=i/5*Math.PI*2;
        atHat(BONE.hat, new THREE.ConeGeometry(2,5.2,4), GOLD, xf(Math.cos(a)*6.6,8.2,Math.sin(a)*6.6));
      }
      atHat(BONE.hat, new THREE.SphereGeometry(1.9,8,6), new THREE.Color(0xff4fa3), xf(0,3.8,7));
    } else if(hat==='party'){
      // The stripes were a texture; on the shared material they are painted
      // into the vertices instead, which is why the cone gained segments.
      const teal = new THREE.Color(0x23e6c9), pink = new THREE.Color(0xff4fa3);
      atHat(BONE.hat, new THREE.ConeGeometry(5.6,16,12,10), null, xf(0,7.4,0),
         (c,g,i)=>{ c.copy(Math.floor(g.attributes.uv.getY(i)*7) % 2 ? pink : teal); });
      atHat(BONE.hat, new THREE.SphereGeometry(2.4,8,6), GOLD, xf(0,15.6,0));
    } else if(hat==='halo'){
      atHat(BONE.hat, new THREE.TorusGeometry(7.0,1.3,8,20), new THREE.Color(0xfff2a8),
         xf(0,7.4,0, 1,1,1).multiply(new THREE.Matrix4().makeRotationX(Math.PI/2)));
      hatGroup.userData.float = true; hatGroup.userData.floatBase = RIG.topY - 1.2;
    } else if(hat==='horns'){
      [-1,1].forEach(s=>{
        atHat(BONE.hat, new THREE.ConeGeometry(2.4,8,8), new THREE.Color(0xff5a4d),
           xf(s*5.8,2.6,0, 1,1,1, -s*0.5));
      });
    } else if(hat==='prop'){
      atHat(BONE.hat, new THREE.SphereGeometry(7.0,14,9,0,Math.PI*2,0,Math.PI/2),
         new THREE.Color(0x60a5fa), xf(0,-1.4,0));
      atHat(BONE.hat, new THREE.CylinderGeometry(0.65,0.65,4.4,6), DARK, xf(0,6.6,0));
      atHat(BONE.hatSpin, new THREE.BoxGeometry(13,0.9,2.3), new THREE.Color(0xff5a4d));
      hatGroup.userData.spin = hatSpin;
    }

    // ---- the two meshes
    const body = new THREE.SkinnedMesh(beanGeometry(), bodyMat);
    body.castShadow = true; body.frustumCulled = false;
    group.add(body); body.bind(skeleton, new THREE.Matrix4());

    const partsMat = new THREE.MeshLambertMaterial({ vertexColors:true });
    const trim = new THREE.SkinnedMesh(mergeParts(parts), partsMat);
    trim.castShadow = true; trim.frustumCulled = false;
    group.add(trim); trim.bind(skeleton, new THREE.Matrix4());

    // ---- no outline any more: the rim light in the material does that job.
    // The shell is kept for the invulnerability flash, and is otherwise hidden.
    // It hangs off the tilt bone, which is where the body it wraps hangs.
    const outMat = new THREE.MeshBasicMaterial({color:0xffffff, side:THREE.BackSide, transparent:true, opacity:0.55, depthWrite:false});
    const outline = new THREE.Mesh(beanOutlineGeometry(), outMat);
    outline.visible = false; tilt.add(outline);

    // ---- specials get an aura: a breathing shell plus motes drifting up off them
    let aura = null;
    if(skin.rarity === 'special'){
      aura = new THREE.Group();
      const col = new THREE.Color(skinBaseColor(skin));
      const shell = new THREE.Mesh(beanGeometry(), new THREE.MeshBasicMaterial({
        color:col, transparent:true, opacity:0.16, side:THREE.BackSide, depthWrite:false }));
      shell.scale.setScalar(1.42); aura.add(shell);
      const motes = [];
      for(let i=0;i<8;i++){
        const m = new THREE.Mesh(new THREE.SphereGeometry(1.7,8,6), new THREE.MeshBasicMaterial({
          color:col, transparent:true, opacity:0.85, depthWrite:false }));
        aura.add(m); motes.push(m);
      }
      aura.userData = {motes, shell};
      tilt.add(aura);
    }

    // ---- glow shell for the light-emitting skins
    if(skin.type==='neon'||skin.type==='rainbowneon'){
      const glow = new THREE.Mesh(beanGeometry(),
        new THREE.MeshBasicMaterial({color:new THREE.Color(skinBaseColor(skin)), transparent:true,
          opacity:0.14, side:THREE.BackSide, depthWrite:false}));
      glow.scale.setScalar(1.22); tilt.add(glow);
    }

    const armPivots = [armL, armR], legPivots = [legL, legR];
    const kneePivots = [kneeL, kneeR], footPivots = [footL, footR];
    const elbowPivots = [elbowL, elbowR], handPivots = [handL, handR];
    // THE REST POSE, set after the bind pose is taken, so these are animation
    // offsets and not baked into the mesh. A figure standing with every joint
    // locked straight reads as a doll; a few degrees of bend everywhere reads
    // as someone standing. The run overwrites all of it each frame anyway.
    //
    // Stated ONCE, here, because neutral() below has to be able to put the
    // character back into exactly this pose. Two copies of these numbers is how
    // one rest pose quietly becomes two different rest poses.
    // armZ was 0.30 against a shoulderX of 8.4. The shoulder now stands 0.8
    // further out, so the same wrist needs less flare to reach: 0.1924 is the
    // angle that lands the mitt on the x it was approved at. See shoulderX.
    //
    // v29b: 0.315 -> 0.23. The v29 arm was measured against the reference's own
    // rendered idle mask and came out right in width and wrong in PLACE: the
    // contour said the free limb cants 20.8 degrees from vertical against the
    // reference's 15.9, so every station of the arm stood further off the body
    // than it should and the inner edge missed by 0.85 of a unit -- the one
    // number that got worse in that pass while width improved by 73%. 4.9
    // degrees is 0.0855 radians, and 0.315 - 0.0855 is 0.23. Nothing about the
    // arm's shape moved for this; it is where the arm hangs, not what it is.
    // Only the REST pose reads this. Every animated pose calls flare() and sets
    // its own, so not one frame of the run, the dive or the fall changes.
    //
    // legZ exists because of that change and not before it. neutral() used to
    // splay the legs at armZ*0.35, so the arms and the legs shared one number
    // and moving the arms in would quietly have swung both hips in by 1.7
    // degrees as well -- a leg change smuggled in under an arm change. 0.11025
    // is exactly what that expression evaluated to at armZ 0.315, so the legs
    // stand where they have always stood; it is the same rest pose, stated in
    // its own name instead of borrowed from the arm's.
    const REST = { armZ:0.23, legZ:0.11025, elbowX:-0.26, kneeX:0.13, hipX:0, ankleX:0 };

    // Put the character in its documented rest pose and clear every transform
    // that belongs to the ANIMATION rather than to the model: the breath, the
    // weight shift, the lean, the squash keyframe, the eye counter-scale.
    //
    // Check 5 measures the racer's PROPORTIONS, and those are a property of the
    // rig. Sampling whichever frame of the idle loop happened to be running
    // moved the measured ratio between 1.49 and 1.52; a reading that depends on
    // timing is not a proportion, and a 1.55 ceiling judged against it is not
    // really a ceiling.
    function neutral(){
      group.scale.set(1, 1, 1);
      tilt.rotation.set(0, 0, 0); tilt.position.set(0, 0, 0);
      bodyBone.scale.set(1, 1, 1);
      head.position.set(0, 0, 0); head.rotation.set(0, 0, 0);
      for(let i=0;i<2;i++){
        const s = i ? 1 : -1;
        legPivots[i].position.set(s*RIG.legX, RIG.hipY, 0);
        legPivots[i].rotation.set(REST.hipX, 0, -s*REST.legZ);
        kneePivots[i].rotation.set(REST.kneeX, 0, 0);
        footPivots[i].rotation.set(REST.ankleX, 0, 0);
        // s is -1 on the LEFT, and the left arm's outward lean is NEGATIVE z --
        // the same convention the rig's own rest pose below and the animation's
        // flare() helper both use. This read `-s*REST.armZ`, which flared both
        // arms INWARD, so neutral() was quietly posing a different character
        // from the one every approval render was shot in.
        armPivots[i].rotation.set(0, 0, s*REST.armZ);
        elbowPivots[i].rotation.set(REST.elbowX, 0, 0);
        handPivots[i].rotation.set(0, 0, 0);
        pupils[i].scale.set(1, 1, 1); scleras[i].scale.set(1, 1, 1);
      }
      group.updateMatrixWorld(true);
      return group;
    }
    armL.rotation.z = -REST.armZ; armR.rotation.z = REST.armZ;  // flare clear of the hips
    elbowL.rotation.x = elbowR.rotation.x = REST.elbowX;        // a little bend at the elbow
    kneeL.rotation.x = kneeR.rotation.x = REST.kneeX;           // soft knees, weight on them
    return {group, tilt, aura, bodyMat, partsMat, outMat, outline, body, trim, skeleton,
            head, faceGroup, hatGroup, pupils, scleras, tongue,
            facePlate, hatProbes, mouth:mouthProbe,
            arms:armPivots, legs:legPivots, armPivots, legPivots, feet, hands,
            kneePivots, footPivots, elbowPivots, handPivots, bodyBone,
            neutral, REST, RIG};
  }
  // v6 name kept so nothing downstream breaks
  const makeBlob = makeCharacter;

  // Drives the special-skin aura. Called from both the race loop and the menu
  // preview, so a special reads the same wherever you see it.
  function animateAura(m, t){
    if(!m || !m.aura) return;
    const {motes, shell} = m.aura.userData;
    for(let i=0;i<motes.length;i++){
      const a  = t*1.5 + i*(Math.PI*2/motes.length);
      const rr = 15 + Math.sin(t*2.2 + i)*2.6;
      const rise = ((t*34 + i*7) % 52) - 10;          // drift upward, then loop
      motes[i].position.set(Math.cos(a)*rr, rise, Math.sin(a)*rr*0.92);
      motes[i].material.opacity = 0.20 + 0.55*Math.max(0, Math.sin(t*2.6 + i*0.8));
      const sc = 1 - clamp((rise+10)/62, 0, 1)*0.55;   // shrink as they rise
      motes[i].scale.setScalar(sc);
    }
    shell.material.opacity = 0.12 + Math.sin(t*2.4)*0.055;
  }
