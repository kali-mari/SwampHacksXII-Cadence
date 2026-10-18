import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { GLView } from 'expo-gl';
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';
import { Buffer } from 'buffer';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { gravityDeltaQuaternion, elbowBendDegrees, POSE_SENSOR_MAP } from '../pose.mjs';
import { colors } from '../theme';

const MODEL_ASSET = require('../assets/TorsoManquine.glb');
const HINGE_AXIS = new THREE.Vector3(0, 0, 1);
const MAX_AGE_MS = 1500;

function fresh(reading, now) {
  return reading?.valid === true && Number.isFinite(reading.receivedAt) &&
    now >= reading.receivedAt && now - reading.receivedAt <= MAX_AGE_MS;
}

function boneOrThrow(model, name) {
  const bone = model.getObjectByName(name);
  if (!bone) throw new Error(`The GLB rig is missing the ${name} bone.`);
  return bone;
}

function setWorldRotation(bone, worldDelta) {
  bone.parent.updateWorldMatrix(true, false);
  bone.updateWorldMatrix(true, false);
  const parentRotation = bone.parent.getWorldQuaternion(new THREE.Quaternion());
  const worldRotation = bone.getWorldQuaternion(new THREE.Quaternion());
  bone.quaternion.copy(
    parentRotation.invert().multiply(worldDelta.multiply(worldRotation)),
  );
}

function setStartingPose(avatar, bones) {
  for (const side of ['left', 'right']) {
    const arm = bones[`${side}UpperArm`];
    const downAngle = side === 'left' ? -Math.PI / 2 : Math.PI / 2;
    setWorldRotation(
      arm,
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), downAngle),
    );
    avatar.updateMatrixWorld(true);
  }

  for (const side of ['left', 'right']) {
    const forearm = bones[`${side}ForeArm`];
    const bendAngle = side === 'left' ? Math.PI / 2 : -Math.PI / 2;
    forearm.quaternion.multiply(
      new THREE.Quaternion().setFromAxisAngle(HINGE_AXIS, bendAngle),
    );
  }
  avatar.updateMatrixWorld(true);
}

function getModelBounds(model) {
  const bounds = new THREE.Box3();
  const vertex = new THREE.Vector3();
  model.updateMatrixWorld(true);

  model.traverse(object => {
    if (!object.isMesh) return;

    if (object.isSkinnedMesh) {
      object.skeleton.update();
      const positions = object.geometry.attributes.position;
      for (let index = 0; index < positions.count; index++) {
        vertex.fromBufferAttribute(positions, index);
        object.boneTransform(index, vertex);
        bounds.expandByPoint(vertex.applyMatrix4(object.matrixWorld));
      }
      return;
    }

    object.geometry.computeBoundingBox();
    if (object.geometry.boundingBox) {
      bounds.union(object.geometry.boundingBox.clone().applyMatrix4(object.matrixWorld));
    }
  });

  if (bounds.isEmpty()) throw new Error('The GLB has no measurable model geometry.');
  return bounds;
}

function createRenderer(gl) {
  const canvas = {
    width: gl.drawingBufferWidth,
    height: gl.drawingBufferHeight,
    style: {},
    addEventListener() {},
    removeEventListener() {},
    clientHeight: gl.drawingBufferHeight,
  };
  return new THREE.WebGLRenderer({ canvas, context: gl, antialias: true });
}

async function loadGlb(asset) {
  if (!asset.localUri) throw new Error('The bundled GLB asset has no local file URI.');
  const base64 = await FileSystem.readAsStringAsync(asset.localUri, { encoding: 'base64' });
  const bytes = Buffer.from(base64, 'base64');
  const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const navigatorObject = globalThis.navigator;
  if (typeof navigatorObject?.userAgent !== 'string') {
    const nativeNavigator = navigatorObject || {};
    Object.defineProperty(nativeNavigator, 'userAgent', {
      configurable: true,
      value: 'React Native',
      writable: true,
    });
    if (!navigatorObject) {
      Object.defineProperty(globalThis, 'navigator', {
        configurable: true,
        value: nativeNavigator,
        writable: true,
      });
    }
  }
  const loader = new GLTFLoader();
  return new Promise((resolve, reject) => loader.parse(arrayBuffer, '', resolve, reject));
}

function swingWithoutHingeTwist(quaternion, axis) {
  const projection = quaternion.x * axis.x + quaternion.y * axis.y + quaternion.z * axis.z;
  const twist = new THREE.Quaternion(
    axis.x * projection,
    axis.y * projection,
    axis.z * projection,
    quaternion.w,
  );
  if (twist.lengthSq() < 1e-8) return quaternion.clone();
  twist.normalize();
  return quaternion.clone().multiply(twist.invert());
}

export default function TorsoPreview({ readings, baseline, now }) {
  const poseRef = useRef({ readings, baseline, now });
  const cleanupRef = useRef(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    poseRef.current = { readings, baseline, now };
  }, [readings, baseline, now]);

  useEffect(() => () => cleanupRef.current?.(), []);

  async function onContextCreate(gl) {
    let cancelled = false;
    let animationFrame = null;
    let stage = 'creating WebGL renderer';
    let renderer;
    let gltf;
    const stop = () => {
      cancelled = true;
      if (animationFrame !== null) cancelAnimationFrame(animationFrame);
      gltf?.scene?.traverse(object => {
        object.geometry?.dispose();
        if (Array.isArray(object.material)) object.material.forEach(material => material.dispose());
        else object.material?.dispose();
      });
      renderer?.dispose();
    };
    cleanupRef.current = stop;

    try {
      setError('');
      setLoading(true);
      renderer = createRenderer(gl);
      renderer.setSize(gl.drawingBufferWidth, gl.drawingBufferHeight);
      renderer.setClearColor(colors.panel, 1);

      stage = 'setting up the scene';
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(colors.panel);
      const camera = new THREE.PerspectiveCamera(
        34,
        gl.drawingBufferWidth / gl.drawingBufferHeight,
        0.01,
        100,
      );
      scene.add(new THREE.HemisphereLight(0xffffff, 0x8b776c, 0.5));
      const keyLight = new THREE.DirectionalLight(0xffffff, 0.9);
      keyLight.position.set(-2, 4, 5);
      scene.add(keyLight);
      const fillLight = new THREE.DirectionalLight(0xffffff, 0.2);
      fillLight.position.set(3, 1, -3);
      scene.add(fillLight);

      stage = 'downloading the GLB asset';
      const asset = Asset.fromModule(MODEL_ASSET);
      await asset.downloadAsync();
      if (cancelled) return;
      stage = 'parsing the GLB asset';
      gltf = await loadGlb(asset);
      if (cancelled) return;

      stage = 'setting up the model rig';
      const avatar = gltf.scene;
      avatar.traverse(object => {
        if (object.isSkinnedMesh) object.frustumCulled = false;
      });

      const bones = Object.fromEntries(
        Object.entries(POSE_SENSOR_MAP)
          .map(([key, mapping]) => [key, boneOrThrow(avatar, mapping.bone)]),
      );
      setStartingPose(avatar, bones);
      const rest = Object.fromEntries(
        Object.entries(bones).map(([key, bone]) => [key, bone.quaternion.clone()]),
      );

      const bounds = getModelBounds(avatar);
      const size = bounds.getSize(new THREE.Vector3());
      const center = bounds.getCenter(new THREE.Vector3());
      avatar.position.set(-center.x, -bounds.min.y, -center.z);
      scene.add(avatar);

      const viewHeight = Math.max(size.y, size.x / camera.aspect) * 1.12;
      const targetY = size.y * 0.52;
      const distance = viewHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
      camera.position.set(0, targetY, distance);
      camera.lookAt(0, targetY, 0);

      setLoading(false);
      const render = () => {
        if (cancelled) return;
        try {
          stage = 'rendering the model';
          const { readings: currentReadings, baseline: neutral, now: currentTime } = poseRef.current;
          const neutralSensors = neutral?.sensors || {};
          const frameTargets = {};

          for (const key of ['leftUpperArm', 'rightUpperArm']) {
            const { imu, side } = POSE_SENSOR_MAP[key];
            const reading = currentReadings[imu];
            const neutralAcceleration = neutralSensors[imu]?.accelerationMps2;
            frameTargets[key] = fresh(reading, currentTime) && neutralAcceleration
              ? gravityDeltaQuaternion(reading, neutralAcceleration, side)
              : null;
          }

          for (const key of ['leftForeArm', 'rightForeArm']) {
            const { imu, flex, side } = POSE_SENSOR_MAP[key];
            const upperKey = `${side}UpperArm`;
            const forearmReading = currentReadings[imu];
            const upperRotation = frameTargets[upperKey];
            const forearmBaseline = neutralSensors[imu]?.accelerationMps2;
            const flexReading = currentReadings[flex];
            const neutralFlex = neutralSensors[flex]?.resistanceOhms;
            let localSwing = new THREE.Quaternion();

            if (fresh(forearmReading, currentTime) && forearmBaseline && upperRotation) {
              const forearmRotation = gravityDeltaQuaternion(forearmReading, forearmBaseline, side);
              if (forearmRotation) {
                const relative = new THREE.Quaternion(...upperRotation).invert()
                  .multiply(new THREE.Quaternion(...forearmRotation));
                localSwing = swingWithoutHingeTwist(relative, HINGE_AXIS);
              }
            }

            const bend = fresh(flexReading, currentTime)
              ? elbowBendDegrees(flexReading.resistanceOhms, neutralFlex)
              : null;
            const sign = side === 'left' ? 1 : -1;
            const hinge = bend === null
              ? new THREE.Quaternion()
              : new THREE.Quaternion().setFromAxisAngle(
                HINGE_AXIS,
                THREE.MathUtils.degToRad(bend * sign),
              );
            frameTargets[key] = localSwing.multiply(hinge).toArray();
          }

          for (const [key, bone] of Object.entries(bones)) {
            const delta = frameTargets[key];
            const target = delta
              ? rest[key].clone().multiply(new THREE.Quaternion(...delta))
              : rest[key];
            bone.quaternion.slerp(target, 0.16);
          }

          renderer.render(scene, camera);
          gl.endFrameEXP();
          animationFrame = requestAnimationFrame(render);
        } catch (renderError) {
          if (!cancelled) {
            console.error(`Torso preview failed while ${stage}.`, renderError);
            setError(`Could not render the upper-body model while ${stage}: ${renderError.message || String(renderError)}`);
            stop();
          }
        }
      };
      render();
    } catch (loadError) {
      if (!cancelled) {
        setLoading(false);
        console.error(`Torso preview failed while ${stage}.`, loadError);
        setError(`Could not load the upper-body model while ${stage}: ${loadError.message || String(loadError)}`);
      }
    }
  }

  return <View style={styles.frame}>
    <GLView style={styles.gl} onContextCreate={onContextCreate} />
    {loading && !error && <Text style={styles.overlay}>Loading the torso rig…</Text>}
    {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
  </View>;
}

const styles = StyleSheet.create({
  frame: {
    width: '100%',
    height: 340,
    overflow: 'hidden',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panel,
  },
  gl: { flex: 1 },
  overlay: {
    position: 'absolute',
    alignSelf: 'center',
    bottom: 10,
    color: colors.muted,
    fontSize: 11,
    backgroundColor: colors.panel,
    paddingHorizontal: 8,
  },
  error: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    color: colors.bad,
    backgroundColor: colors.badBg,
    borderRadius: 10,
    padding: 10,
    fontSize: 12,
  },
});
