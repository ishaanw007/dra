import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Button,
  Alert,
  TouchableOpacity,
} from 'react-native';
import * as Location from 'expo-location';
import { Accelerometer, Magnetometer, Gyroscope } from 'expo-sensors';
import {
  Camera,
  CameraType,
  CameraView,
  useCameraPermissions,
  CameraCapturedPicture,
} from 'expo-camera';
import KalmanFilter from 'kalmanjs';
import { quat, mat3 } from 'gl-matrix';

const UPDATE_INTERVAL = 100; // Update interval for sensors in milliseconds
const TOLERANCE = {
  azimuth: 5, // degrees
  pitch: 5, // degrees
  roll: 5, // degrees
  latitude: 0.0001, // degrees (~11 meters)
  longitude: 0.0001, // degrees (~11 meters)
};

interface Orientation {
  azimuth: number;
  pitch: number;
  roll: number;
}

interface LocationData {
  latitude: number;
  longitude: number;
}

const App: React.FC = () => {
  const [facing, setFacing] = useState<CameraType>('back');
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [hasLocationPermission, setHasLocationPermission] = useState<boolean | null>(null);

  const [location, setLocation] = useState<LocationData | null>(null);
  const [orientation, setOrientation] = useState<Orientation | null>(null);

  const [storedLocation, setStoredLocation] = useState<LocationData | null>(null);
  const [storedOrientation, setStoredOrientation] = useState<Orientation | null>(null);

  const accelerometerData = useRef({ x: 0, y: 0, z: 0 });
  const magnetometerData = useRef({ x: 0, y: 0, z: 0 });
  const gyroscopeData = useRef({ x: 0, y: 0, z: 0 });
  const cameraRef = useRef<CameraView>(null);

  // Initialize Kalman filters for accelerometer data
  const kalmanFilterAx = useRef(new KalmanFilter({ R: 0.01, Q: 3 }));
  const kalmanFilterAy = useRef(new KalmanFilter({ R: 0.01, Q: 3 }));
  const kalmanFilterAz = useRef(new KalmanFilter({ R: 0.01, Q: 3 }));

  // Initialize Kalman filters for magnetometer data
  const kalmanFilterMx = useRef(new KalmanFilter({ R: 0.01, Q: 3 }));
  const kalmanFilterMy = useRef(new KalmanFilter({ R: 0.01, Q: 3 }));
  const kalmanFilterMz = useRef(new KalmanFilter({ R: 0.01, Q: 3 }));

  // Initialize Kalman filters for gyroscope data
  const kalmanFilterGx = useRef(new KalmanFilter({ R: 0.01, Q: 3 }));
  const kalmanFilterGy = useRef(new KalmanFilter({ R: 0.01, Q: 3 }));
  const kalmanFilterGz = useRef(new KalmanFilter({ R: 0.01, Q: 3 }));

  const prevTimestamp = useRef<number | null>(null);
  const orientationQuat = useRef<quat>(quat.create());

  useEffect(() => {
    const requestPermissions = async () => {
      // Request Location Permission
      const { status: locationStatus } = await Location.requestForegroundPermissionsAsync();
      setHasLocationPermission(locationStatus === 'granted');

      if (locationStatus !== 'granted') {
        Alert.alert('Permission to access location was denied');
      }

      // Request Camera Permission if not already granted
      if (!cameraPermission) {
        await requestCameraPermission();
      }
    };

    requestPermissions();
  }, []);

  useEffect(() => {
    let accelerometerSubscription: any;
    let magnetometerSubscription: any;
    let gyroscopeSubscription: any;

    if (cameraPermission?.granted && hasLocationPermission) {
      // Set sensor update intervals
      Accelerometer.setUpdateInterval(UPDATE_INTERVAL);
      Magnetometer.setUpdateInterval(UPDATE_INTERVAL);
      Gyroscope.setUpdateInterval(UPDATE_INTERVAL);

      // Subscribe to accelerometer data
      accelerometerSubscription = Accelerometer.addListener((data) => {
        // Apply Kalman filter to each axis
        const filteredAx = kalmanFilterAx.current.filter(data.x);
        const filteredAy = kalmanFilterAy.current.filter(data.y);
        const filteredAz = kalmanFilterAz.current.filter(data.z);

        accelerometerData.current = { x: filteredAx, y: filteredAy, z: filteredAz };
        computeOrientation();
      });

      // Subscribe to magnetometer data
      magnetometerSubscription = Magnetometer.addListener((data) => {
        // Apply Kalman filter to each axis
        const filteredMx = kalmanFilterMx.current.filter(data.x);
        const filteredMy = kalmanFilterMy.current.filter(data.y);
        const filteredMz = kalmanFilterMz.current.filter(data.z);

        magnetometerData.current = { x: filteredMx, y: filteredMy, z: filteredMz };
        computeOrientation();
      });

      // Subscribe to gyroscope data
      gyroscopeSubscription = Gyroscope.addListener((data) => {
        // Apply Kalman filter to each axis
        const filteredGx = kalmanFilterGx.current.filter(data.x);
        const filteredGy = kalmanFilterGy.current.filter(data.y);
        const filteredGz = kalmanFilterGz.current.filter(data.z);

        gyroscopeData.current = { x: filteredGx, y: filteredGy, z: filteredGz };
        computeOrientation();
      });
    }

    return () => {
      accelerometerSubscription && accelerometerSubscription.remove();
      magnetometerSubscription && magnetometerSubscription.remove();
      gyroscopeSubscription && gyroscopeSubscription.remove();
    };
  }, [cameraPermission?.granted, hasLocationPermission]);

  const computeOrientation = () => {
    const currentTime = Date.now();
    let dt = 0;

    if (prevTimestamp.current !== null) {
      dt = (currentTime - prevTimestamp.current) / 1000; // in seconds
    }
    prevTimestamp.current = currentTime;

    const { x: gx, y: gy, z: gz } = gyroscopeData.current;

    if (dt > 0) {
      const omegaMagnitude = Math.sqrt(gx * gx + gy * gy + gz * gz);

      if (omegaMagnitude > 0) {
        const thetaOverTwo = (omegaMagnitude * dt) / 2;
        const sinThetaOverTwo = Math.sin(thetaOverTwo);
        const cosThetaOverTwo = Math.cos(thetaOverTwo);

        const deltaQuat = quat.create();
        deltaQuat[0] = (gx / omegaMagnitude) * sinThetaOverTwo;
        deltaQuat[1] = (gy / omegaMagnitude) * sinThetaOverTwo;
        deltaQuat[2] = (gz / omegaMagnitude) * sinThetaOverTwo;
        deltaQuat[3] = cosThetaOverTwo;

        // Update orientation quaternion
        quat.multiply(orientationQuat.current, orientationQuat.current, deltaQuat);
        quat.normalize(orientationQuat.current, orientationQuat.current);
      }
    }

    // Get accelerometer and magnetometer data
    const { x: ax, y: ay, z: az } = accelerometerData.current;
    const { x: mx, y: my, z: mz } = magnetometerData.current;

    // Normalize accelerometer vector
    let normA = Math.sqrt(ax * ax + ay * ay + az * az);
    if (normA === 0) normA = 1e-6; // Prevent division by zero
    const axNorm = ax / normA;
    const ayNorm = ay / normA;
    const azNorm = az / normA;

    // Normalize magnetometer vector
    let normM = Math.sqrt(mx * mx + my * my + mz * mz);
    if (normM === 0) normM = 1e-6; // Prevent division by zero
    const mxNorm = mx / normM;
    const myNorm = my / normM;
    const mzNorm = mz / normM;

    // Calculate the horizontal component of the magnetic field vector
    const hx = myNorm * azNorm - mzNorm * ayNorm;
    const hy = mzNorm * axNorm - mxNorm * azNorm;
    const hz = mxNorm * ayNorm - myNorm * axNorm;

    // Normalize the horizontal component
    let normH = Math.sqrt(hx * hx + hy * hy + hz * hz);
    if (normH === 0) normH = 1e-6; // Prevent division by zero
    const hxNorm = hx / normH;
    const hyNorm = hy / normH;
    const hzNorm = hz / normH;

    // Rotation matrix elements
    const m11 = hxNorm;
    const m12 = hyNorm;
    const m13 = hzNorm;
    const m21 = ayNorm * hzNorm - azNorm * hyNorm;
    const m22 = azNorm * hxNorm - axNorm * hzNorm;
    const m23 = axNorm * hyNorm - ayNorm * hxNorm;
    const m31 = axNorm;
    const m32 = ayNorm;
    const m33 = azNorm;

    // Create rotation matrix in column-major order
    const rotationMatrix = mat3.fromValues(
      m11, m21, m31, // First column
      m12, m22, m32, // Second column
      m13, m23, m33  // Third column
    );

    // Compute absolute orientation quaternion from accelerometer and magnetometer data
    const accelMagQuat = quat.create();
    quat.fromMat3(accelMagQuat, rotationMatrix);
    quat.normalize(accelMagQuat, accelMagQuat);

    // Complementary filter to blend gyroscope and accelerometer/magnetometer data
    const alpha = 0.98; // Adjust as needed (higher alpha favors gyroscope data)
    quat.slerp(orientationQuat.current, orientationQuat.current, accelMagQuat, 1 - alpha);
    quat.normalize(orientationQuat.current, orientationQuat.current);

    // Convert quaternion to Euler angles
    const { yaw, pitch, roll } = toEuler(orientationQuat.current);

    // Update orientation state
    setOrientation({ azimuth: yaw, pitch, roll });
  };

  const toEuler = (q: quat) => {
    const ysqr = q[1] * q[1];

    // roll (x-axis rotation)
    let t0 = +2.0 * (q[3] * q[0] + q[1] * q[2]);
    let t1 = +1.0 - 2.0 * (q[0] * q[0] + ysqr);
    let roll = Math.atan2(t0, t1);

    // pitch (y-axis rotation)
    let t2 = +2.0 * (q[3] * q[1] - q[2] * q[0]);
    t2 = t2 > 1.0 ? 1.0 : t2;
    t2 = t2 < -1.0 ? -1.0 : t2;
    let pitch = Math.asin(t2);

    // yaw (z-axis rotation)
    let t3 = +2.0 * (q[3] * q[2] + q[0] * q[1]);
    let t4 = +1.0 - 2.0 * (ysqr + q[2] * q[2]);
    let yaw = Math.atan2(t3, t4);

    // Convert radians to degrees
    roll = roll * (180 / Math.PI);
    pitch = pitch * (180 / Math.PI);
    yaw = yaw * (180 / Math.PI);

    // Normalize yaw to [0, 360)
    yaw = (yaw + 360) % 360;

    return { roll, pitch, yaw };
  };

  const getCurrentLocation = async () => {
    try {
      const currentLocation = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Highest,
      });
      setLocation({
        latitude: currentLocation.coords.latitude,
        longitude: currentLocation.coords.longitude,
      });
    } catch (error) {
      console.log('Location error:', error);
    }
  };

  const takePhoto = async () => {
    await getCurrentLocation();

    if (!cameraRef.current) {
      console.log('Camera ref is not available');
      return;
    }

    try {
      const photo: CameraCapturedPicture = await cameraRef.current.takePictureAsync();

      if (!storedOrientation || !storedLocation) {
        // Store current orientation and location
        setStoredOrientation(orientation);
        setStoredLocation(location);

        Alert.alert(
          'First Photo Taken',
          `Photo saved to: ${photo.uri}\nOrientation and location data stored for comparison.`,
        );
      } else {
        // Compare current orientation and location with stored data
        const orientationMatch = compareOrientation(orientation!, storedOrientation);
        const locationMatch = compareLocation(location!, storedLocation);

        const matchMessage = `Orientation Match: ${
          orientationMatch ? '✅' : '❌'
        }\nLocation Match: ${locationMatch ? '✅' : '❌'}`;

        Alert.alert('Second Photo Taken', `Photo saved to: ${photo.uri}\n\n${matchMessage}`);
      }
    } catch (error) {
      console.log('Camera error:', error);
    }
  };

  const compareOrientation = (current: Orientation, stored: Orientation): boolean => {
    const azimuthDifference = angleDifference(current.azimuth, stored.azimuth);
    const pitchDifference = Math.abs(current.pitch - stored.pitch);
    const rollDifference = Math.abs(current.roll - stored.roll);

    return (
      azimuthDifference <= TOLERANCE.azimuth &&
      pitchDifference <= TOLERANCE.pitch &&
      rollDifference <= TOLERANCE.roll
    );
  };

  const compareLocation = (current: LocationData, stored: LocationData): boolean => {
    const latitudeDifference = Math.abs(current.latitude - stored.latitude);
    const longitudeDifference = Math.abs(current.longitude - stored.longitude);

    return (
      latitudeDifference <= TOLERANCE.latitude && longitudeDifference <= TOLERANCE.longitude
    );
  };

  const angleDifference = (angle1: number, angle2: number): number => {
    let difference = Math.abs(angle1 - angle2);
    if (difference > 180) {
      difference = 360 - difference;
    }
    return difference;
  };

  const toggleCameraFacing = () => {
    setFacing((current) => (current === 'back' ? 'front' : 'back'));
  };

  if (!cameraPermission || hasLocationPermission === null) {
    // Permissions are still loading
    return <View />;
  }

  if (!cameraPermission.granted || !hasLocationPermission) {
    return (
      <View style={styles.container}>
        <Text style={styles.message}>
          We need your permission to access the camera and location
        </Text>
        {!cameraPermission.granted && (
          <Button onPress={requestCameraPermission} title="Grant Camera Permission" />
        )}
        {!hasLocationPermission && (
          <Button
            onPress={async () => {
              const { status } = await Location.requestForegroundPermissionsAsync();
              setHasLocationPermission(status === 'granted');
            }}
            title="Grant Location Permission"
          />
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView style={styles.camera} facing={facing} ref={cameraRef}>
        <View style={styles.buttonContainer}>
          <TouchableOpacity style={styles.button} onPress={toggleCameraFacing}>
            <Text style={styles.text}>Flip Camera</Text>
          </TouchableOpacity>
        </View>
      </CameraView>
      <View style={styles.controlsContainer}>
        <Button title="Take Photo" onPress={takePhoto} />
      </View>
      <View style={styles.infoContainer}>
        <Text>Current Latitude: {location?.latitude?.toFixed(6) ?? 'N/A'}</Text>
        <Text>Current Longitude: {location?.longitude?.toFixed(6) ?? 'N/A'}</Text>
        <Text>Azimuth: {orientation?.azimuth?.toFixed(2) ?? 'Calculating...'}°</Text>
        <Text>Pitch: {orientation?.pitch?.toFixed(2) ?? 'Calculating...'}°</Text>
        <Text>Roll: {orientation?.roll?.toFixed(2) ?? 'Calculating...'}°</Text>
        {storedOrientation && storedLocation && (
          <>
            <Text style={{ marginTop: 10 }}>Stored Data:</Text>
            <Text>Stored Latitude: {storedLocation.latitude.toFixed(6)}</Text>
            <Text>Stored Longitude: {storedLocation.longitude.toFixed(6)}</Text>
            <Text>Stored Azimuth: {storedOrientation.azimuth.toFixed(2)}°</Text>
            <Text>Stored Pitch: {storedOrientation.pitch.toFixed(2)}°</Text>
            <Text>Stored Roll: {storedOrientation.roll.toFixed(2)}°</Text>
          </>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  message: {
    textAlign: 'center',
    padding: 10,
    marginTop: 20,
  },
  camera: {
    flex: 1,
  },
  buttonContainer: {
    flex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'flex-end',
  },
  button: {
    alignSelf: 'center',
    marginBottom: 20,
  },
  controlsContainer: {
    padding: 20,
    backgroundColor: '#fff',
  },
  infoContainer: {
    padding: 20,
    backgroundColor: '#fff',
  },
  text: {
    fontSize: 18,
    color: '#fff',
  },
});

export default App;
