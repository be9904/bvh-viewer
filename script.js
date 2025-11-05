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
    this.channels = channels;
    this.channel_order = [];
    this.parent = parent;
    this.length = 0; // length of joint (float)
    this.rotation = new THREE.Vector3(0, 0, 0);
    this.quaternion = new THREE.Quaternion();
    this.children = []; // child joints (Joint)
    this.position = offset.clone();
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

    this.clearTimer();

    // create timeline
    this.frameTimer = setInterval(() => {
      if (this.isPlaying) {
        this.frame = (this.frame + 1) % this.frame_count;
      }
    }, this.frame_time * 1000);
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

////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////

// ------------------------
// Initialization
// ------------------------

// global properties
const bvhText_default = document.getElementById("bvh-data").textContent; // place holder for bvh file
let animator = null;
let bvhText = null;
let rootView;
let frame = 0;
let frameTimer = null;
let isPlaying = false;

// ------------------------
// GUI Settings
// ------------------------

function gui() {
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

function init() {
  // dispose any previous testViews
  if (rootView) {
    rootView.dispose();
  }

  // create materials
  const material = {
    joint: new THREE.MeshStandardMaterial({ color: 0x0077ff }),
    link: new THREE.MeshStandardMaterial({ color: 0x999999 }),
  };

  // parse bvh file
  const [root, motionData] = parseBVH(
    bvhText === null ? bvhText_default : bvhText
  );

  // reset previous animator timers and create a new one
  if (animator) {
    animator.clearTimer();
  }
  animator = new Animator(root, motionData);

  // create view and apply material to joints
  rootView = new JointView(root, material, frames);

  // add joint view in scene
  scene.add(rootView.object3d);

  // joint controller and gui for user control
  const gui = new lil.GUI();
  const baseFolder = gui.addFolder("Size");
  new JointController(rootView, baseFolder, () => {
    rootView.updateSize();
  });
  baseFolder.open();

  // initial update, set skeleton pose to frame 0
  rootView.update();
}

// ------------------------
// Animate Loop
// ------------------------

function animate() {
  requestAnimationFrame(animate);

  animator.update();

  rootView.update();
  controls.update();
  renderer.render(scene, camera);
}

////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////

// ------------------------
// Main
// ------------------------

console.log("bvhText_default loaded.");
init();
gui();
animate();
