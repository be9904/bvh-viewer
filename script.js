// ------------------------
// Configurations
// ------------------------
// setup the renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// setup our scene
let scene = new THREE.Scene();
scene.background = new THREE.Color(0x333333);

// set default axis
let axis = new THREE.Vector3(1, 0, 0);

// draw xz grid plane
const width = 1000;
const height = 1000;

// Create a plane lying on XY
const geometry = new THREE.PlaneGeometry(width, height);
const material = new THREE.MeshBasicMaterial({
  color: 0,
  side: THREE.DoubleSide,
  transparent: false,
});
const plane = new THREE.Mesh(geometry, material);
plane.rotation.x = Math.PI / 2;

scene.add(plane);

const size = 500; // width/height
const divisions = 250;

const gridHelper = new THREE.GridHelper(width, divisions, 0x888888, 0x444444);

scene.add(gridHelper);

// setup camera and initial position
const camera = new THREE.PerspectiveCamera(
  45,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.set(15, 15, 30);

// trackball
const controls = new THREE.OrbitControls(camera, renderer.domElement);

// lighting
const ambientLight = new THREE.AmbientLight(0x404040, 1.5);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
directionalLight.position.set(5, 5, 5);
scene.add(directionalLight);

const pointLight = new THREE.PointLight(0xffffff, 1, 50);
pointLight.position.set(-5, 5, 5);
scene.add(pointLight);

// visualize axes
const axesLength = 500;
const lineMaterialX = new THREE.LineBasicMaterial({ color: 0xff0000 }); // 빨강 (X축)
const lineMaterialY = new THREE.LineBasicMaterial({ color: 0x00ff00 }); // 초록 (Y축)
const lineMaterialZ = new THREE.LineBasicMaterial({ color: 0x0000ff }); // 파랑 (Z축)
const lineGeometryX = new THREE.BufferGeometry().setFromPoints([
  new THREE.Vector3(-axesLength, 0, 0),
  new THREE.Vector3(axesLength, 0, 0),
]);
const lineGeometryY = new THREE.BufferGeometry().setFromPoints([
  new THREE.Vector3(0, -axesLength, 0),
  new THREE.Vector3(0, axesLength, 0),
]);
const lineGeometryZ = new THREE.BufferGeometry().setFromPoints([
  new THREE.Vector3(0, 0, -axesLength),
  new THREE.Vector3(0, 0, axesLength),
]);
scene.add(new THREE.Line(lineGeometryX, lineMaterialX));
scene.add(new THREE.Line(lineGeometryY, lineMaterialY));
scene.add(new THREE.Line(lineGeometryZ, lineMaterialZ));

// HTML에 버튼 추가
const buttonContainer = document.createElement("div");
buttonContainer.style.position = "absolute";
buttonContainer.style.top = "10px";
buttonContainer.style.left = "10px";
buttonContainer.style.zIndex = "100";
document.body.appendChild(buttonContainer);

// 버튼 생성 함수
function createButton(label, onClick) {
  const button = document.createElement("button");
  button.innerText = label;
  button.style.margin = "5px";
  button.style.padding = "10px";
  button.style.fontSize = "14px";
  button.addEventListener("click", onClick);
  buttonContainer.appendChild(button);
  return button;
}

////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////

// ------------------------
// Utility Functions
// ------------------------

// convert to radians
const rad = THREE.MathUtils.degToRad;

// fetch raw github data
async function getBVHData(url) {
  const res = await fetch(url);
  let text = await res.text();

  return text;
}

////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////

// ------------------------
// Model
// ------------------------
class Joint {
  constructor(
    name,
    offset = new THREE.Vector3(),
    channels = [],
    parent = null
  ) {
    this.name = name; // name of joint (string)
    this.offset = offset; // offset from parent joint (x, y, z)
    this.channels = channels; // save channel as list
    this.channel_order = []; // for euler order
    this.rotation = new THREE.Vector3(0, 0, 0); // rotation parsed from parser
    this.quaternion = new THREE.Quaternion(); // actual rotation to use

    this.parent = parent; // parent joint
    this.length = 0; // length of joint (float)
    this.children = []; // child joints (Joint)
    this.position = offset.clone(); // used by root
  }

  updateLength() {
    this.length = Math.sqrt(
      // length parent-child(self)
      this.offset.x ** 2 + this.offset.y ** 2 + this.offset.z ** 2
    );
  }

  addChild(joint) {
    joint.parent = this;
    this.children.push(joint);
  }
}

// ------------------------
// View
// ------------------------
class JointView {
  constructor(joint, material, frames) {
    // init member variables
    this.joint = joint;
    this.frames = frames;

    this.object3d = new THREE.Object3D();

    this.joint_size = 0.5;
    this.jointMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.5),
      material.joint
    );

    this.link_size = 0.5;
    this.linkMesh = null;

    this.childViews = [];

    /////////////////////////////////////////////////////////////

    // draw joint mesh
    this.object3d.add(this.jointMesh);

    // create child views
    for (let child of joint.children) {
      const childView = new JointView(child, material, frames);

      // position child at local offset
      childView.object3d.position.copy(child.offset);
      this.object3d.add(childView.object3d);

      // create link mesh that connects child
      childView.linkMesh = new THREE.Mesh(
        new THREE.BoxGeometry(child.length, 0.5, 0.5),
        material.link
      );

      // copy child offset
      const linkOffset = child.offset.clone();

      // set position at midpoint of parent and child
      childView.linkMesh.position.set(
        0.5 * linkOffset.x,
        0.5 * linkOffset.y,
        0.5 * linkOffset.z
      );

      // align x-axis of link to the offset
      childView.linkMesh.quaternion.setFromUnitVectors(
        new THREE.Vector3(1, 0, 0),
        linkOffset.clone().normalize()
      );

      this.object3d.add(childView.linkMesh);

      // add to childViews list
      this.childViews.push(childView);
    }
  }

  update() {
    // update root joint's position
    if (!this.joint.parent) {
      this.object3d.position.copy(this.joint.position);
    }

    // update rotations
    if (this.joint.channels.length > 0) {
      this.object3d.quaternion.copy(this.joint.quaternion);
    }

    // update child links and recursively update all children
    if (this.childViews && this.childViews.length > 0) {
      this.childViews.forEach((child) => {
        if (child && child.object3d && child.joint) {
          child.object3d.position.copy(child.joint.offset);
          child.update();
        }
      });
    }
  }

  updateSize() {
    const joint_scale = this.joint_size / 0.25;
    this.jointMesh.scale.set(joint_scale, joint_scale, joint_scale);

    if (this.linkMesh) {
      const linkScale = this.link_size / 0.25;
      this.linkMesh.scale.set(1, linkScale, linkScale);
    }

    this.childViews.forEach((child) => {
      child.updateSize();
    });
  }

  // dispose joint and link mesh
  dispose() {
    // dispose geometry
    if (this.jointMesh) {
      this.object3d.remove(this.jointMesh);
      this.jointMesh.geometry.dispose();
      this.jointMesh.material.dispose();
    }

    this.childViews.forEach((child) => {
      if (child.linkMesh) {
        this.object3d.remove(child.linkMesh);
        child.linkMesh.geometry.dispose();
        child.linkMesh.material.dispose();
      }
      child.dispose(); // recursion
    });

    this.childViews.length = 0;
  }
}

// ------------------------
// Controller
// ------------------------
class JointController {
  constructor(jointView, baseFolder, onChangeCallback) {
    baseFolder
      .add(jointView, "joint_size", 0, 2)
      .name("Size")
      .onChange(onChangeCallback);
  }
}

////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////

// ------------------------
// Parser
// ------------------------

// hierarchy parser
function parseHierarchy(hierarchy) {
  let index = 1;

  const parseJoint = function (parent = null) {
    let line = hierarchy[index++]; // set first line of hierarchy section
    let isEndSite = line.startsWith("End Site"); // check if joint is an End Site
    let name = isEndSite ? "EndSite" : line.split(/\s+/)[1]; // name the joint End Site if it is an end site

    const joint = new Joint(name); // create joint with joint name

    if (hierarchy[index++] !== "{") throw new Error(`Expected {`);

    while (index < hierarchy.length) {
      // repeat line by line(entire file)
      line = hierarchy[index]; // set current line with index

      if (line.startsWith("OFFSET")) {
        // if line starts with OFFSET
        const parts = line.split(/\s+/).map(parseFloat); // parse each token into floats
        joint.offset.set(parts[1], parts[2], parts[3]); // set joint offset with parsed tokens
        joint.updateLength();
        index++; // increment index
      } else if (line.startsWith("CHANNELS")) {
        // if line starts with CHANNELS
        const parts = line.split(/\s+/); // split line into tokens
        joint.channels = parts.slice(2); // shallow copy of items starting from index 2 (set channel names)
        joint.channel_order = joint.channels.slice(-3).map((ch) => ch[0]);
        index++; // increment index
      } else if (line.startsWith("JOINT") || line.startsWith("End Site")) {
        // if line starts with JOINT or End Site
        const child = parseJoint(joint); // recursively call this function to parse child joint
        joint.addChild(child); // if it returns, add the joint to child
      } else if (line === "}") {
        // if line is '}'
        index++; // increment index
        break; // break from this loop
      } else {
        index++; // skip any unknown line
      }
    }

    return joint; // return parsed joint
  };

  return parseJoint();
}

// motion parser
function parseMotion(motion) {
  let total_lines = motion.length;
  let line_num = 1;

  // set frame count and frame time
  const frame_count = parseInt(motion[line_num++].trim().split(/\s+/)[1]);
  const frame_time = parseFloat(motion[line_num++].trim().split(/\s+/)[2]);
  console.log(`frame count: '${frame_count}'`);
  console.log(`frame time: '${frame_time}'`);

  let frames = []; // (number of joints) x (frame_count)

  // parse frames
  while (line_num < total_lines) {
    const line = motion[line_num++].trim().split(/\s+/);

    // create an array of joint rotations
    let frame = [];
    line.forEach((val) => {
      frame.push(parseFloat(val));
    });
    frames.push(frame);
  }

  return [frame_count, frame_time, frames];
}

// bvh file parser
function parseBVH(bvhText) {
  // parse the file into lines (remove any empty lines)
  const lines = bvhText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  // error check hierarchy section
  if (lines[0] !== "HIERARCHY") {
    throw new Error("Invalid BVH: Missing 'HIERARCHY' section");
  }

  // locate motion section
  const motion_idx = lines.findIndex((line) => line === "MOTION");
  if (motion_idx === -1) {
    throw new Error("Invalid BVH: Missing 'MOTION' section");
  }
  const hierarchy = lines.slice(0, motion_idx);
  const motion = lines.slice(motion_idx);

  // convert hierarchy into tree
  const root = parseHierarchy(hierarchy);

  // read motion data
  const motionData = parseMotion(motion);

  return [root, motionData];
}

// ------------------------
// Animator (Updates Joint)
// ------------------------
class Animator {
  constructor(root, motionData) {
    this.root = root;
    this.frame_count = motionData[0];
    this.frame_time = motionData[1];
    this.frames = motionData[2];
    this.frame = 0;
    this.frameTimer = null;
    this.isPlaying = false;

    this.splitFrame = -1;

    this.clearTimer();

    // create timeline
    this.frameTimer = setInterval(() => {
      if (this.isPlaying) {
        this.frame = (this.frame + 1) % this.frame_count;
      }
    }, this.frame_time * 1000);
  }

  setBVH(root, motionData) {
    this.root = root;
    this.motionData = motionData;
  }

  update() {
    this.transformJoint(this.root, { idx: 0 }, true);
  }

  transformJoint(joint, state, isRoot = false) {
    // set root's position
    if (isRoot) {
      joint.channels.forEach((channel) => {
        if (channel === "Xposition")
          joint.position.x = this.frames[this.frame][state.idx++];
        else if (channel === "Yposition")
          joint.position.y = this.frames[this.frame][state.idx++];
        else if (channel === "Zposition")
          joint.position.z = this.frames[this.frame][state.idx++];
      });
    }

    // set joint rotations recursively
    let rotation = { x: 0, y: 0, z: 0 };
    for (let channel of joint.channel_order) {
      switch (channel) {
        case "X":
          rotation.x = this.frames[this.frame][state.idx++];
          break;
        case "Y":
          rotation.y = this.frames[this.frame][state.idx++];
          break;
        case "Z":
          rotation.z = this.frames[this.frame][state.idx++];
          break;
      }
    }

    // make quaternion from euler rotations
    joint.quaternion.identity();
    if (joint.channel_order.length > 0) {
      let order = joint.channel_order.join("");
      joint.quaternion.setFromEuler(
        new THREE.Euler(
          rad(rotation.x),
          rad(rotation.y),
          rad(rotation.z),
          order
        )
      );
    }

    joint.children.forEach((child) => this.transformJoint(child, state, false));
  }

  clearTimer() {
    // clear timer
    if (this.frameTimer) {
      clearInterval(this.frameTimer);
      this.frameTimer = null;
    }
  }
}

function stitch_motion(rootA, motionDataA, rootB, motionDataB) {
  // unpack motion data
  let [fc1, ft1, f1] = motionDataA;
  let [fc2, ft2, f2] = motionDataB;

  // match blend speed to time
  const MIX_DURATION = 1; // mix for 1 second
  // calculate how many frames correspond to MIX_DURATION
  const BLEND_FRAMES = Math.ceil(MIX_DURATION / ft1); 

  // map of how to interpolate each channel
  let blendMap = []; // instructions: { type: 'lerp', idx: 0 } or { type: 'slerp', indices: [0,1,2], order: 'XYZ' }
  let globalChannelIndex = 0;

  function createBlendMap(joint) {
    let rotIndices = {}; // stores { 'X': index, 'Y': index, 'Z': index }
    let hasRot = false;

    // scan this joint's channels
    joint.channels.forEach((ch) => {
      if (ch.toLowerCase().includes("position")) {
        // lerp for positions
        blendMap.push({ type: "lerp", idx: globalChannelIndex });
        globalChannelIndex++;
      } else if (ch.toLowerCase().includes("rotation")) {
        hasRot = true;
        const axis = ch.charAt(0).toUpperCase(); // 'X', 'Y', or 'Z'
        rotIndices[axis] = globalChannelIndex;
        globalChannelIndex++;
      }
    });

    // if this joint has rotations, group them for slerp
    if (hasRot) {
      blendMap.push({
        type: "slerp",
        indices: [rotIndices["X"], rotIndices["Y"], rotIndices["Z"]],
        order: joint.channel_order.join(""), // e.g., "ZXY"
      });
    }

    // recursively map children
    joint.children.forEach(createBlendMap);
  }

  // generate the map based on the first skeleton
  createBlendMap(rootA);

  // identify root channels
  let xPosIdx = -1, yPosIdx = -1, zPosIdx = -1;
  let xRotIdx = -1, yRotIdx = -1, zRotIdx = -1;

  rootA.channels.forEach((channel, index) => {
    if (channel === "Xposition") xPosIdx = index;
    if (channel === "Yposition") yPosIdx = index;
    if (channel === "Zposition") zPosIdx = index;
    if (channel === "Yrotation") yRotIdx = index;
    if (channel === "Xrotation") xRotIdx = index;
    if (channel === "Zrotation") zRotIdx = index;
  });

  // calculate alignment
  // end of clip A
  const lastFrameA = f1[f1.length - 1];
  const posA_End = new THREE.Vector3(
    lastFrameA[xPosIdx],
    lastFrameA[yPosIdx],
    lastFrameA[zPosIdx]
  );

  // extract yaw A
  const rotA_Full = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(
      rad(lastFrameA[xRotIdx]),
      rad(lastFrameA[yRotIdx]),
      rad(lastFrameA[zRotIdx]),
      rootA.channel_order.join("")
    )
  );
  const eulerA = new THREE.Euler().setFromQuaternion(rotA_Full, "YXZ");
  const rotA_Yaw = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(0, eulerA.y, 0, "YXZ")
  );

  // start of clip B
  const firstFrameB = f2[0];
  const posB_Start = new THREE.Vector3(
    firstFrameB[xPosIdx],
    firstFrameB[yPosIdx],
    firstFrameB[zPosIdx]
  );

  // extract yaw B
  const rotB_Full = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(
      rad(firstFrameB[xRotIdx]),
      rad(firstFrameB[yRotIdx]),
      rad(firstFrameB[zRotIdx]),
      rootB.channel_order.join("")
    )
  );
  const eulerB = new THREE.Euler().setFromQuaternion(rotB_Full, "YXZ");
  const rotB_Yaw = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(0, eulerB.y, 0, "YXZ")
  );

  // calculate delta
  const deltaQuat = rotA_Yaw.clone().multiply(rotB_Yaw.clone().invert());

  // align clip B frames
  let f2_aligned = JSON.parse(JSON.stringify(f2));

  f2_aligned.forEach((frame) => {
    // align position
    let currentPos = new THREE.Vector3(
      frame[xPosIdx],
      frame[yPosIdx],
      frame[zPosIdx]
    );
    let offset = new THREE.Vector3().subVectors(currentPos, posB_Start);
    offset.applyQuaternion(deltaQuat);

    frame[xPosIdx] = posA_End.x + offset.x;
    frame[zPosIdx] = posA_End.z + offset.z;
    frame[yPosIdx] = currentPos.y; // keep original floor height

    // align rotation
    let currentRot = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(
        rad(frame[xRotIdx]),
        rad(frame[yRotIdx]),
        rad(frame[zRotIdx]),
        rootB.channel_order.join("")
      )
    );
    currentRot.premultiply(deltaQuat);
    const newEuler = new THREE.Euler().setFromQuaternion(
      currentRot,
      rootB.channel_order.join("")
    );

    frame[xRotIdx] = THREE.MathUtils.radToDeg(newEuler.x);
    frame[yRotIdx] = THREE.MathUtils.radToDeg(newEuler.y);
    frame[zRotIdx] = THREE.MathUtils.radToDeg(newEuler.z);
  });

  // generate blend frames with slerp
  let blendFrames = [];
  const startFrame = lastFrameA;
  const endFrame = f2_aligned[0];
  const totalChannels = startFrame.length;

  for (let i = 1; i <= BLEND_FRAMES; i++) {
    const t = i / (BLEND_FRAMES + 1); // 0 < t < 1
    
    // create an empty frame array
    let newFrame = new Array(totalChannels).fill(0);

    // use blendMap to determine how to mix each part of the body
    blendMap.forEach((instruction) => {
      
      if (instruction.type === "lerp") {
        // lerp positions
        const idx = instruction.idx;
        const valA = startFrame[idx];
        const valB = endFrame[idx];
        newFrame[idx] = valA + (valB - valA) * t;

      } else if (instruction.type === "slerp") {
        // slerp rotations
        const [idxX, idxY, idxZ] = instruction.indices;
        const order = instruction.order;

        // get quaternion A
        const qA = new THREE.Quaternion().setFromEuler(
          new THREE.Euler(
            rad(startFrame[idxX]),
            rad(startFrame[idxY]),
            rad(startFrame[idxZ]),
            order
          )
        );

        // get quaternion B
        const qB = new THREE.Quaternion().setFromEuler(
          new THREE.Euler(
            rad(endFrame[idxX]),
            rad(endFrame[idxY]),
            rad(endFrame[idxZ]),
            order
          )
        );

        // slerp
        qA.slerp(qB, t);

        // convert back to degrees
        const resultEuler = new THREE.Euler().setFromQuaternion(qA, order);
        newFrame[idxX] = THREE.MathUtils.radToDeg(resultEuler.x);
        newFrame[idxY] = THREE.MathUtils.radToDeg(resultEuler.y);
        newFrame[idxZ] = THREE.MathUtils.radToDeg(resultEuler.z);
      }
    });

    blendFrames.push(newFrame);
  }

  // Stitch results
  let stitched = f1.concat(blendFrames).concat(f2_aligned);
  let total_frames = stitched.length;
  let frame_time = ft1 === ft2 ? ft1 : -1;

  console.log(`Stitched: Generated ${blendFrames.length} blend frames for ${MIX_DURATION}s duration.`);

  return [total_frames, frame_time, stitched];
}

////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////

// global properties
const bvhText_default = document.getElementById("bvh-data").textContent; // place holder for bvh file
let animator = null;
let rootView;
let frame = 0;
let frameTimer = null;
let isPlaying = false;
const bvhFileList = [
  "a_001_1_1.bvh",
  "a_001_1_2.bvh",
  "a_001_2_1.bvh",
  "a_001_2_2.bvh",
  "a_002_1_1.bvh",
  "a_002_1_2.bvh",
  "a_002_2_1.bvh",
  "a_002_2_2.bvh",
  "a_002_3_1.bvh",
  "a_002_3_2.bvh",
  "a_003_1_1.bvh",
  "a_003_1_2.bvh",
  "a_003_2_1.bvh",
  "a_003_2_2.bvh",
  "a_003_4_1.bvh",
  "a_003_4_2.bvh",
  "a_004_1_1.bvh",
  "a_004_1_2.bvh",
  "a_004_2_1.bvh",
  "a_004_2_2.bvh",
  "a_005_1_1.bvh",
  "a_005_1_2.bvh",
  "a_005_2_1.bvh",
  "a_005_2_2.bvh",
  "a_006_1_1.bvh",
  "a_006_1_2.bvh",
  "a_006_2_1.bvh",
  "a_006_2_2.bvh",
];
const bvhSource = 'https://raw.githubusercontent.com/whcjs13/Anim2025/main/'
let bvhFile_1 = bvhFileList[3];
let bvhFile_2 = bvhFileList[21];
let bvhText_1 = null;
let bvhText_2 = null;

// ------------------------
// GUI Settings
// ------------------------

async function gui() {
  // event listener for when window is resized
  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // add play button
  const playButton = createButton("Play", () => {
    animator.isPlaying = !animator.isPlaying;
    playButton.innerText = animator.isPlaying ? "Pause" : "Play";
  });

  /////////////////////////////////////////////////////////////////////////

  // create progress bar container
  const progressContainer = document.createElement("div");
  progressContainer.style.marginTop = "10px";
  progressContainer.style.color = "white";
  progressContainer.style.fontFamily = "monospace";
  buttonContainer.appendChild(progressContainer);

  // create a wrapper for the slider and the marker
  const sliderWrapper = document.createElement("div");
  sliderWrapper.style.position = "relative";
  sliderWrapper.style.width = "300px";
  sliderWrapper.style.height = "20px"; // Height of the slider area
  sliderWrapper.style.display = "inline-block";
  sliderWrapper.style.display = "flex";
  sliderWrapper.style.alignItems = "center";
  progressContainer.appendChild(sliderWrapper);

  // create range slider
  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = 0;
  // NOTE: Max will be set in Animate or Init because frame count changes dynamically
  slider.value = 0;
  slider.style.width = "100%"; // Ensure it fills the wrapper
  slider.style.margin = "0"; // Remove default margins
  slider.style.verticalAlign = "middle";
  slider.id = "frame-slider"; // ID for access in animate loop
  sliderWrapper.appendChild(slider);

  // create the split marker
  const marker = document.createElement("div");
  marker.id = "split-marker";
  marker.style.position = "absolute";
  marker.style.top = "-5px"; // Stick out slightly above
  marker.style.bottom = "-5px"; // Stick out slightly below
  marker.style.width = "2px";
  marker.style.backgroundColor = "#ff0000"; // Red color
  marker.style.pointerEvents = "none"; // Let clicks pass through to slider
  marker.style.display = "none"; // Hide initially
  marker.style.zIndex = "10";
  sliderWrapper.appendChild(marker);

  // create frame counter label (e.g., "0 / 100")
  const frameLabel = document.createElement("span");
  frameLabel.innerText = ` 0 / 0`;
  frameLabel.style.marginLeft = "10px";
  frameLabel.id = "frame-label"; // ID for access in animate loop
  progressContainer.appendChild(frameLabel);

  // add interaction (scrubbing)
  slider.addEventListener("input", (e) => {
    // when user drags slider, update the animator's frame
    const targetFrame = parseInt(e.target.value);
    animator.frame = targetFrame;

    // update the skeleton immediately so it feels responsive
    animator.update();

    // pause while scrubbing so it doesn't fight the timer
    animator.isPlaying = false;
    playButton.innerText = "Play";
  });

  const animLabel = document.createElement("div");
  animLabel.style.color = "white";
  animLabel.style.fontFamily = "monospace";
  animLabel.style.marginTop = "5px";
  animLabel.style.marginBottom = "5px";
  animLabel.style.fontSize = "16px";
  animLabel.id = "anim-label";
  animLabel.innerText = "Current Animation: None";
  buttonContainer.appendChild(animLabel);

  /////////////////////////////////////////////////////////////////////////

  // upload bvh file button
  const uploadInput = document.getElementById("bvh-upload");
  uploadInput.addEventListener("change", (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
      bvhText = e.target.result; // save file content to bvhText
      console.log(`${file.name} loaded.`);
      playButton.innerText = "Play";
      init();
    };
    reader.readAsText(file);
  });
}

// ------------------------
// Initialization
// ------------------------

async function init() {
  // dispose any previous testViews
  if (rootView) {
    rootView.dispose();
  }

  // create materials
  const material = {
    joint: new THREE.MeshStandardMaterial({ color: 0x0077ff }),
    link: new THREE.MeshStandardMaterial({ color: 0x999999 }),
  };

  // bvh files
  bvhText_1 = await getBVHData(bvhSource + bvhFile_1);
  bvhText_2 = await getBVHData(bvhSource + bvhFile_2);
  // bvhText_1 = await getBVHData("https://raw.githubusercontent.com/CreativeInquiry/BVH-Examples/refs/heads/master/example-openFrameworks-0.98/example-bvh/bin/data/A_test.bvh");
  // bvhText_2 = await getBVHData("https://raw.githubusercontent.com/CreativeInquiry/BVH-Examples/refs/heads/master/example-openFrameworks-0.98/example-bvh/bin/data/B_test.bvh");
  const [root, m1] = parseBVH(bvhText_1);
  const [r2, m2] = parseBVH(bvhText_2);

  // parse bvh file and stitch
  const motionData = stitch_motion(root, m1, r2, m2);

  // reset previous animator timers and create a new one
  if (animator) {
    animator.clearTimer();
  }
  animator = new Animator(root, motionData);
  animator.splitFrame = m1[0]; // set split frame for gui

  // update slider max now that we know total stitched frames
  const slider = document.getElementById("frame-slider");
  if (slider) {
    slider.max = animator.frame_count - 1;
    // update marker position
    const marker = document.getElementById("split-marker");
    if (marker) {
      const percentage = (animator.splitFrame / animator.frame_count) * 100;
      marker.style.left = `${percentage}%`;
      marker.style.display = "block";
      marker.title = `Split at frame ${animator.splitFrame}`;
    }
  }

  // create view and apply material to joints
  rootView = new JointView(root, material, motionData[2]);

  // add joint view in scene
  scene.add(rootView.object3d);

  // joint controller and gui for user control
  // Only add if not added before (simple check)
  // Note: in this structure we re-create gui every time, ideally we should clear it
  // But for this snippet, we assume one-time load or simple refresh.

  // initial update, set skeleton pose to frame 0
  rootView.update();
}

// ------------------------
// Animate Loop
// ------------------------

function animate() {
  requestAnimationFrame(animate);

  if (animator) animator.update();
  if (rootView) rootView.update();
  controls.update();
  renderer.render(scene, camera);

  // gui update
  // sync slider with animation
  if (animator) {
    const slider = document.getElementById("frame-slider");
    const label = document.getElementById("frame-label");
    const animLabel = document.getElementById("anim-label");

    // Only update slider value if the user isn't currently dragging it
    if (slider && document.activeElement !== slider) {
      slider.value = animator.frame;
    }

    // Update text label
    if (label) {
      label.innerText = ` ${animator.frame} / ${animator.frame_count}`;
    }

    if (animLabel) {
      if (animator.frame < animator.splitFrame) {
        animLabel.innerText = `Current Animation: ${bvhFile_1}`;
      } else {
        animLabel.innerText = `Current Animation: ${bvhFile_2}`;
      }
    }
  }
}

////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////

// ------------------------
// Main
// ------------------------

console.log("bvhText_default loaded.");
(async () => {
  await gui(); // Setup GUI first
  await init(); // Then load BVH
  animate();
})();